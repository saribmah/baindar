import { expo } from "@better-auth/expo";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, emailOTP } from "better-auth/plugins";
import type { RuntimeEnv } from "../app/context";
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
    ],
  });
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
