import { expo } from "@better-auth/expo";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, emailOTP } from "better-auth/plugins";
import type { RuntimeEnv } from "../app/context";
import { Billing } from "../billing/billing";
import { createDb } from "../db/db";
import * as schema from "../db/schema";

export type Auth = ReturnType<typeof createAuth>;

export const createAuth = (env: RuntimeEnv) => {
  const db = createDb(env);

  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
    };
  }

  const configuredOrigins = (env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Mobile app deep-link scheme + Expo dev URLs. Without these the Expo client
  // sign-out/social-callback requests are rejected as untrusted origins.
  const mobileOrigins = ["baindar://", "baindar://*", "exp://", "exp://**"];
  // Electrobun loads the desktop view from views://mainview/index.html in
  // production builds, so the Origin header on auth requests is
  // `views://mainview`. The desktop deep-link scheme is also added so the
  // OAuth callback (baindar-desktop://auth/callback) is accepted.
  const desktopOrigins = ["views://mainview", "baindar-desktop://", "baindar-desktop://*"];
  const trustedOrigins = [...configuredOrigins, ...mobileOrigins, ...desktopOrigins];

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || undefined,
    basePath: "/auth",
    trustedOrigins,
    emailAndPassword: { enabled: false },
    socialProviders,
    plugins: [
      // Required for the Expo client plugin: handles native cookie/origin
      // handling and OAuth deep-link redirects.
      expo(),
      // Accepts the same session token as `Authorization: Bearer <token>`,
      // so non-browser callers (CLI, future MCP shim, mobile) authenticate
      // against the same session store the web app uses via cookies.
      bearer(),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          await sendOtpEmail(env, { email, otp, type });
        },
      }),
      // Polar (billing). Plugin is omitted entirely when credentials aren't
      // configured so local dev / OpenAPI codegen still initialise cleanly.
      // `createCustomerOnSignUp` links the Polar customer to our user via
      // `externalId === user.id`, so we don't need a separate customer-id
      // column on the user table — webhook callbacks resolve the user via
      // the externalId on the event payload.
      ...buildPolarPlugins(env),
    ],
  });
};

const buildPolarPlugins = (env: RuntimeEnv) => {
  const config = (() => {
    const accessToken = env.POLAR_ACCESS_TOKEN as string;
    const webhookSecret = env.POLAR_WEBHOOK_SECRET as string;
    const organizationId = env.POLAR_ORGANIZATION_ID as string;
    if (!accessToken || !webhookSecret || !organizationId) return null;
    const server: "sandbox" | "production" =
      (env.POLAR_SERVER as string) === "production" ? "production" : "sandbox";
    const successUrl = (env.POLAR_SUCCESS_URL as string) || "/settings?checkout=success";
    return { accessToken, webhookSecret, organizationId, server, successUrl };
  })();
  if (!config) return [];

  const polarClient = new Polar({ accessToken: config.accessToken, server: config.server });

  // Product slugs map our internal Plan enum names to Polar product IDs.
  // The frontend opens `/auth/checkout/<slug>` to start the checkout flow,
  // so keeping slugs aligned with Plan keeps the upgrade UI's URL building
  // trivial. Any product without a configured ID is omitted from the slug
  // list — the checkout for that plan simply 404s until you set the var.
  const slugProducts: Array<{ productId: string; slug: string }> = [];
  const personal = env.POLAR_PRODUCT_PERSONAL as string;
  const pro = env.POLAR_PRODUCT_PRO as string;
  const byok = env.POLAR_PRODUCT_BYOK as string;
  if (personal) slugProducts.push({ productId: personal, slug: "personal" });
  if (pro) slugProducts.push({ productId: pro, slug: "pro" });
  if (byok) slugProducts.push({ productId: byok, slug: "byok" });

  return [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: slugProducts,
          successUrl: config.successUrl,
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          secret: config.webhookSecret,
          onSubscriptionCreated: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("created", payload)),
          onSubscriptionUpdated: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("updated", payload)),
          onSubscriptionActive: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("active", payload)),
          onSubscriptionCanceled: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("canceled", payload)),
          onSubscriptionRevoked: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("revoked", payload)),
          onSubscriptionUncanceled: async (payload) =>
            void Billing.applyPolarEvent(toBillingEvent("uncanceled", payload)),
        }),
      ],
    }),
  ];
};

// Polar webhook payloads are typed by their SDK but we only need a thin
// projection. Defensive lookups — Polar occasionally adds/renames optional
// fields, and we'd rather log a warning (in applyPolarEvent) than throw and
// retry-loop the webhook.
const toBillingEvent = (
  kind: Billing.PolarSubscriptionEvent["kind"],
  payload: unknown,
): Billing.PolarSubscriptionEvent => {
  const data = (payload as { data?: Record<string, unknown> })?.data ?? {};
  const sub = data as Record<string, unknown>;
  const customer = (sub.customer as Record<string, unknown> | undefined) ?? {};
  const status = (sub.status as string) ?? "active";

  const safeDate = (raw: unknown): Date | null => {
    if (typeof raw !== "string" && !(raw instanceof Date)) return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // Coerce status to one of our SubscriptionStatus values; unknown values
  // fall back to "active" so a billing-side rename doesn't take the row
  // out of sync.
  const knownStatus = (() => {
    switch (status) {
      case "active":
      case "trialing":
      case "past_due":
      case "canceled":
      case "incomplete":
        return status;
      default:
        return "active";
    }
  })();

  return {
    kind,
    subscriptionId: (sub.id as string) ?? "",
    productId: (sub.productId as string) ?? (sub.product_id as string) ?? "",
    externalUserId:
      (customer.externalId as string | null) ?? (customer.external_id as string | null) ?? null,
    customerId: (customer.id as string) ?? (sub.customerId as string) ?? "",
    status: knownStatus,
    currentPeriodStart: safeDate(sub.currentPeriodStart) ?? safeDate(sub.current_period_start),
    currentPeriodEnd: safeDate(sub.currentPeriodEnd) ?? safeDate(sub.current_period_end),
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd) || Boolean(sub.cancel_at_period_end),
  };
};

type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

const sendOtpEmail = async (
  env: RuntimeEnv,
  input: { email: string; otp: string; type: OtpType },
): Promise<void> => {
  // No EMAIL_FROM = local dev / unconfigured. Print the OTP to the Worker
  // logs so dev sign-in still works without an onboarded sending domain.
  if (!env.EMAIL_FROM) {
    console.log(`[email-otp] ${input.type} for ${input.email}: ${input.otp}`);
    return;
  }
  await env.EMAIL.send({
    from: env.EMAIL_FROM,
    to: input.email,
    subject: subjectFor(input.type),
    text: `Your code is ${input.otp}. It expires shortly.`,
  });
};

const subjectFor = (type: OtpType): string => {
  switch (type) {
    case "sign-in":
      return "Your sign-in code";
    case "email-verification":
      return "Verify your email";
    case "forget-password":
      return "Reset your password";
    case "change-email":
      return "Confirm your new email";
  }
};
