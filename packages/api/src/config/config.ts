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

  // ---- RevenueCat (billing provider) -----------------------------------

  export const RevenueCatNotConfiguredError = NamedError.create(
    "RevenueCatNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type RevenueCatNotConfiguredError = InstanceType<typeof RevenueCatNotConfiguredError>;

  export type RevenueCatConfig = {
    projectId: string;
    secretApiKey: string;
    webhookAuth: string;
    apiBaseUrl: string;
  };

  // Returns null if any required RevenueCat var is missing. Lets the API
  // initialise cleanly in environments without billing credentials (local
  // dev without RC keys, OpenAPI codegen runs) — purchase + webhook paths
  // throw a typed RevenueCatNotConfiguredError that maps to 500, while
  // read-only routes still surface plan=free.
  //
  // Casts via `as string` mirror `isTestMode` — wrangler.jsonc's literal
  // defaults narrow these to the empty-string literal type, but at runtime
  // they're plain strings once secrets are bound.
  export const getRevenueCat = (): RevenueCatConfig | null => {
    const env = Instance.env;
    const projectId = env.REVENUECAT_PROJECT_ID as string;
    const secretApiKey = env.REVENUECAT_SECRET_API_KEY as string;
    const webhookAuth = env.REVENUECAT_WEBHOOK_AUTH as string;
    if (!projectId || !secretApiKey || !webhookAuth) return null;
    return { projectId, secretApiKey, webhookAuth, apiBaseUrl: "https://api.revenuecat.com" };
  };

  export const requireRevenueCat = (): RevenueCatConfig => {
    const config = getRevenueCat();
    if (!config) throw new RevenueCatNotConfiguredError({});
    return config;
  };

  // Maps a RevenueCat entitlement id to our internal Plan enum. Returns
  // null for unknown IDs so the webhook can log + ignore instead of
  // throwing. Entitlement IDs come from the RC dashboard and are set as
  // env vars alongside the RC project ID.
  export const getRevenueCatPlanForEntitlement = (
    entitlementId: string,
  ): "personal" | "pro" | "byok" | null => {
    const env = Instance.env;
    const personal = env.REVENUECAT_ENTITLEMENT_PERSONAL as string;
    const pro = env.REVENUECAT_ENTITLEMENT_PRO as string;
    const byok = env.REVENUECAT_ENTITLEMENT_BYOK as string;
    if (personal && entitlementId === personal) return "personal";
    if (pro && entitlementId === pro) return "pro";
    if (byok && entitlementId === byok) return "byok";
    return null;
  };

  // ---- Platform LLM ----------------------------------------------------

  // Mirror of `ProviderSetInput` for the platform-supplied default model.
  // Same shape on both sides means BYOK and platform credentials feed the
  // same model builder in `Provider`.
  export type PlatformLlmConfig = {
    spec: "anthropic" | "openai";
    baseUrl: string;
    model: string;
    apiKey: string;
  };

  export const PlatformLlmNotConfiguredError = NamedError.create(
    "PlatformLlmNotConfiguredError",
    z.object({ field: z.string().optional(), message: z.string().optional() }),
  );
  export type PlatformLlmNotConfiguredError = InstanceType<typeof PlatformLlmNotConfiguredError>;

  // Returns null if any required field is missing. Callers that genuinely
  // need a model (chat, summary) should use `requirePlatformLlm()`.
  export const getPlatformLlm = (): PlatformLlmConfig | null => {
    const env = Instance.env;
    const spec = env.PLATFORM_LLM_SPEC as string | undefined;
    const baseUrl = env.PLATFORM_LLM_BASE_URL as string | undefined;
    const model = env.PLATFORM_LLM_MODEL as string | undefined;
    const apiKey = env.PLATFORM_LLM_API_KEY as string | undefined;
    if (!spec || !baseUrl || !model || !apiKey) return null;
    if (spec !== "anthropic" && spec !== "openai") return null;
    return { spec, baseUrl, model, apiKey };
  };

  export const requirePlatformLlm = (): PlatformLlmConfig => {
    const config = getPlatformLlm();
    if (!config) {
      throw new PlatformLlmNotConfiguredError({
        message:
          "PLATFORM_LLM_SPEC, PLATFORM_LLM_BASE_URL, PLATFORM_LLM_MODEL, and PLATFORM_LLM_API_KEY must all be set",
      });
    }
    return config;
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
