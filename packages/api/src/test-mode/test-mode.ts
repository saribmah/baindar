import { z } from "zod";
import { Config } from "../config/config";
import { NamedError } from "../utils/error";
import { TestModeStore } from "./test-mode-store";

// Local-only test harness for the @baindar/testing package. Every operation
// gates on Config.isTestMode() and throws NotEnabledError otherwise — the
// route layer maps that to 404 so production never advertises that these
// endpoints exist.
export namespace TestMode {
  // ---- Errors -----------------------------------------------------------
  export const NotEnabledError = NamedError.create(
    "TestModeNotEnabledError",
    z.object({ message: z.string().optional() }),
  );
  export type NotEnabledError = InstanceType<typeof NotEnabledError>;

  // ---- Schemas ----------------------------------------------------------
  export const SignInInput = z
    .object({
      email: z.string().email(),
      name: z.string().optional(),
    })
    .meta({ ref: "TestModeSignInInput" });
  export type SignInInput = z.infer<typeof SignInInput>;

  export const SignInResponse = z
    .object({
      userId: z.string(),
      sessionToken: z.string(),
    })
    .meta({ ref: "TestModeSignInResponse" });
  export type SignInResponse = z.infer<typeof SignInResponse>;

  export const StatusResponse = z.object({ enabled: z.literal(true) }).meta({
    ref: "TestModeStatusResponse",
  });
  export type StatusResponse = z.infer<typeof StatusResponse>;

  // ---- Operations -------------------------------------------------------
  // Mints a Better Auth session for any email and returns the bearer token.
  // The bearer() plugin is already registered in createAuth(), so passing
  // the returned token as `Authorization: Bearer <token>` is accepted by
  // every authenticated route.
  export const signIn = async (input: SignInInput): Promise<SignInResponse> => {
    if (!Config.isTestMode()) throw new NotEnabledError({});
    return TestModeStore.upsertUserAndSession({
      email: input.email,
      name: input.name ?? defaultNameFor(input.email),
    });
  };

  // Wipes user + R2 state. FK cascades clean up sessions, accounts,
  // verifications, documents, and every per-format child table. R2 cleanup
  // sweeps the `users/` prefix where document originals and derived assets
  // live.
  export const reset = async (): Promise<void> => {
    if (!Config.isTestMode()) throw new NotEnabledError({});
    await TestModeStore.wipeAll();
  };

  // Non-destructive probe used by the @baindar/testing wrapper to decide
  // whether the live backend is in test mode before running the suites.
  // Same NotEnabledError → 404 mapping as every other test-mode route, so
  // production never advertises it either.
  export const status = (): StatusResponse => {
    if (!Config.isTestMode()) throw new NotEnabledError({});
    return { enabled: true };
  };

  const defaultNameFor = (email: string): string => {
    const [local] = email.split("@");
    return local && local.length > 0 ? local : "Test User";
  };
}
