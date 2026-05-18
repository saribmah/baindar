import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { RuntimeEnv } from "../app/context";
import { createDb } from "../db/db";
import { Instance } from "../instance";
import { createAnonymousAuth } from "../middleware/auth";
import {
  type AccountDeletionParams,
  deleteAuthUser,
  destroyAllConversations,
  destroyAllDocuments,
  destroyBinder,
  sweepUserR2,
} from "./deletion-steps";

// Account deletion workflow. Five idempotent steps so retries are safe:
//
//   1. deleteAuthUser — drop user row first; D1 cascades sessions/accounts/
//      profile/billing/provider settings. Closes off every sign-in path
//      before we start tearing down user-owned storage, so a user who
//      taps "delete" and then immediately tries to sign in again cannot
//      land back in a half-deleted account. BinderDO is keyed by
//      `idFromName(userId)` and lives independently of the D1 row, so
//      subsequent steps can still enumerate documents/conversations.
//   2. destroyAllDocuments — for each catalog doc: destroy DocumentDO + R2
//   3. destroyAllConversations — for each catalog conv: destroy ChatAgent
//   4. destroyBinder — wipe per-user BinderDO storage
//   5. sweepUserR2 — safety-net sweep under `users/{userId}/`
//
// The route handler triggers this and returns 202 immediately. Step
// bodies live in `./deletion-steps.ts` so the bun test runtime can
// re-use them via a fake DELETE_USER binding.
export class AccountDeletionWorkflow extends WorkflowEntrypoint<RuntimeEnv, AccountDeletionParams> {
  override async run(
    event: WorkflowEvent<AccountDeletionParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const params = event.payload;
    const env = this.env;
    const provide = <R>(fn: () => Promise<R>): Promise<R> => {
      const db = createDb(env);
      return Instance.provide({ auth: createAnonymousAuth(), env, db }, fn);
    };

    await step.do(
      "deleteAuthUser",
      {
        retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
        timeout: "30 seconds",
      },
      () => provide(() => deleteAuthUser(params)),
    );

    await step.do(
      "destroyAllDocuments",
      {
        retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
        timeout: "10 minutes",
      },
      () => provide(() => destroyAllDocuments(params)),
    );

    await step.do(
      "destroyAllConversations",
      {
        retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
        timeout: "5 minutes",
      },
      () => provide(() => destroyAllConversations(params)),
    );

    await step.do(
      "destroyBinder",
      {
        retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
        timeout: "1 minute",
      },
      () => provide(() => destroyBinder(params)),
    );

    await step.do(
      "sweepUserR2",
      {
        retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
        timeout: "10 minutes",
      },
      () => provide(() => sweepUserR2(params)),
    );
  }
}
