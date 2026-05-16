import { z } from "zod";
import { Instance } from "../instance";
import { NamedError } from "../utils/error";

// Config namespace: typed accessors for env-derived configuration.
// Feature/route modules MUST read config through here, not via direct env reads.
export namespace Config {
  export const BetterAuthSecretNotConfiguredError = NamedError.create(
    "BetterAuthSecretNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type BetterAuthSecretNotConfiguredError = InstanceType<
    typeof BetterAuthSecretNotConfiguredError
  >;

  export const getBetterAuthSecret = (): string | null => {
    const value = Instance.env.BETTER_AUTH_SECRET;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  export const requireBetterAuthSecret = (): string => {
    const secret = getBetterAuthSecret();
    if (!secret) throw new BetterAuthSecretNotConfiguredError({});
    return secret;
  };

  export const getBetterAuthUrl = (): string | null => {
    const value = Instance.env.BETTER_AUTH_URL;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  export const getApiPublicHost = (): string | null => {
    const value = Instance.env.API_PUBLIC_HOST;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  export const getWebPublicHost = (): string | null => {
    const value = Instance.env.WEB_PUBLIC_HOST;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  export const R2BucketNotConfiguredError = NamedError.create(
    "R2BucketNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type R2BucketNotConfiguredError = InstanceType<typeof R2BucketNotConfiguredError>;

  export const requireR2Bucket = (): R2Bucket => {
    const bucket = Instance.env.BUCKET;
    if (!bucket) throw new R2BucketNotConfiguredError({});
    return bucket;
  };

  export const AiNotConfiguredError = NamedError.create(
    "AiNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type AiNotConfiguredError = InstanceType<typeof AiNotConfiguredError>;

  export const requireAi = (): Ai => {
    const ai = Instance.env.AI;
    if (!ai) throw new AiNotConfiguredError({});
    return ai;
  };

  // ---- Polar (billing provider) -----------------------------------------

  export const PolarNotConfiguredError = NamedError.create(
    "PolarNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type PolarNotConfiguredError = InstanceType<typeof PolarNotConfiguredError>;

  export type PolarConfig = {
    accessToken: string;
    webhookSecret: string;
    organizationId: string;
    server: "sandbox" | "production";
    successUrl: string;
  };

  // Returns null if any required Polar var is missing. Lets Better Auth
  // initialise cleanly in environments without billing credentials (local
  // dev without a Polar account, OpenAPI codegen runs) — the plugin is
  // simply omitted in that case.
  //
  // Casts via `as string` mirror `isTestMode` — wrangler.jsonc's literal
  // defaults narrow these to the empty-string literal type, but at runtime
  // they're plain strings once secrets are bound.
  export const getPolar = (): PolarConfig | null => {
    const env = Instance.env;
    const accessToken = env.POLAR_ACCESS_TOKEN as string;
    const webhookSecret = env.POLAR_WEBHOOK_SECRET as string;
    const organizationId = env.POLAR_ORGANIZATION_ID as string;
    if (!accessToken || !webhookSecret || !organizationId) return null;
    const server: "sandbox" | "production" =
      (env.POLAR_SERVER as string) === "production" ? "production" : "sandbox";
    // Polar requires absolute URLs for success_url. We resolve a configured
    // path against WEB_PUBLIC_HOST so devs can keep `/settings` in config
    // and have the right host slot in per environment.
    const successUrl = resolvePolarSuccessUrl(
      (env.POLAR_SUCCESS_URL as string) || "/settings?checkout=success",
      (env.WEB_PUBLIC_HOST as string) || "",
    );
    return { accessToken, webhookSecret, organizationId, server, successUrl };
  };

  const resolvePolarSuccessUrl = (configured: string, webHost: string): string => {
    if (/^https?:\/\//i.test(configured)) return configured;
    const host = webHost.replace(/\/$/, "");
    const path = configured.startsWith("/") ? configured : `/${configured}`;
    return host ? `${host}${path}` : configured;
  };

  export const requirePolar = (): PolarConfig => {
    const config = getPolar();
    if (!config) throw new PolarNotConfiguredError({});
    return config;
  };

  // Reverse mapping: plan slug → Polar product ID. Used by the GET
  // checkout wrapper so a user clicking "Upgrade to Pro" knows which
  // product to send to Polar's checkout.create. Returns null when the
  // plan isn't configured (e.g. BYOK not yet rolled out).
  export const getPolarProductForPlan = (plan: "personal" | "pro" | "byok"): string | null => {
    const env = Instance.env;
    if (plan === "personal") return (env.POLAR_PRODUCT_PERSONAL as string) || null;
    if (plan === "pro") return (env.POLAR_PRODUCT_PRO as string) || null;
    if (plan === "byok") return (env.POLAR_PRODUCT_BYOK as string) || null;
    return null;
  };

  // Maps a Polar product ID to our internal Plan enum. Returns null for
  // unknown IDs so the webhook can log + ignore instead of throwing.
  // Product IDs come from Polar's dashboard; set as env vars (non-secret)
  // alongside the Polar credentials.
  export const getPolarPlanForProduct = (productId: string): "personal" | "pro" | "byok" | null => {
    const env = Instance.env;
    const personal = env.POLAR_PRODUCT_PERSONAL as string;
    const pro = env.POLAR_PRODUCT_PRO as string;
    const byok = env.POLAR_PRODUCT_BYOK as string;
    if (personal && productId === personal) return "personal";
    if (pro && productId === pro) return "pro";
    if (byok && productId === byok) return "byok";
    return null;
  };

  // Surfaced as a list for the frontend so the upgrade flow can render
  // available products as checkout buttons. Empty array if not configured.
  export const getPolarProducts = (): Array<{
    plan: "personal" | "pro" | "byok";
    productId: string;
  }> => {
    const env = Instance.env;
    const out: Array<{ plan: "personal" | "pro" | "byok"; productId: string }> = [];
    const personal = env.POLAR_PRODUCT_PERSONAL as string;
    const pro = env.POLAR_PRODUCT_PRO as string;
    const byok = env.POLAR_PRODUCT_BYOK as string;
    if (personal) out.push({ plan: "personal", productId: personal });
    if (pro) out.push({ plan: "pro", productId: pro });
    if (byok) out.push({ plan: "byok", productId: byok });
    return out;
  };

  // ---- Provider (BYOK key encryption) ----------------------------------

  export const ProviderEncryptionKeyNotConfiguredError = NamedError.create(
    "ProviderEncryptionKeyNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type ProviderEncryptionKeyNotConfiguredError = InstanceType<
    typeof ProviderEncryptionKeyNotConfiguredError
  >;

  // Master key used to encrypt user-supplied API keys at rest. 32 bytes of
  // entropy, base64-encoded. Generate with `openssl rand -base64 32`.
  // Rotation requires a re-encrypt pass; until then, treat as forever-stable.
  export const getProviderEncryptionKey = (): string | null => {
    const value = Instance.env.PROVIDER_ENCRYPTION_KEY as string | undefined;
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  export const requireProviderEncryptionKey = (): string => {
    const key = getProviderEncryptionKey();
    if (!key) throw new ProviderEncryptionKeyNotConfiguredError({});
    return key;
  };

  // Local-only flag that gates the `/__test__/*` endpoints used by the
  // `@baindar/testing` package. Both env types declare `TEST_MODE: "false"`
  // statically (so `Config.isTestMode` type-checks); the `dev:test` script
  // overrides at runtime via `wrangler --var TEST_MODE:true`. Cast through
  // `string` because the literal type narrows comparison out otherwise.
  export const isTestMode = (): boolean => (Instance.env.TEST_MODE as string) === "true";
}
