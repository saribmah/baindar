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

  export const SandboxR2MountNotConfiguredError = NamedError.create(
    "SandboxR2MountNotConfiguredError",
    z.object({ name: z.string(), message: z.string().optional() }),
  );
  export type SandboxR2MountNotConfiguredError = InstanceType<
    typeof SandboxR2MountNotConfiguredError
  >;

  export const isSandboxR2Local = (): boolean => readEnvString("SANDBOX_R2_LOCAL") === "true";

  export const requireSandboxR2BucketName = (): string =>
    requireEnvString("SANDBOX_R2_BUCKET_NAME");

  export const requireSandboxR2Endpoint = (): string => {
    const accountId = requireEnvString("CLOUDFLARE_ACCOUNT_ID");
    return `https://${accountId}.r2.cloudflarestorage.com`;
  };

  export const requireSandboxR2Credentials = (): {
    accessKeyId: string;
    secretAccessKey: string;
  } => ({
    accessKeyId: requireEnvString("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvString("R2_SECRET_ACCESS_KEY"),
  });

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

  // Local-only flag that gates the `/__test__/*` endpoints used by the
  // `@baindar/testing` package. Both env types declare `TEST_MODE: "false"`
  // statically (so `Config.isTestMode` type-checks); the `dev:test` script
  // overrides at runtime via `wrangler --var TEST_MODE:true`. Cast through
  // `string` because the literal type narrows comparison out otherwise.
  export const isTestMode = (): boolean => (Instance.env.TEST_MODE as string) === "true";

  const readEnvString = (name: string): string | null => {
    const value = (Instance.env as unknown as Record<string, unknown>)[name];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const requireEnvString = (name: string): string => {
    const value = readEnvString(name);
    if (!value) throw new SandboxR2MountNotConfiguredError({ name });
    return value;
  };
}
