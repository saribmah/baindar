import { eq } from "drizzle-orm";
import { Agent } from "../agent/agent";
import { Binder } from "../binder/binder";
import { user } from "../db/schema";
import { DocumentAssetStore } from "../document/asset-store";
import { DocumentBinding } from "../document/document-binding";
import { Config } from "../config/config";
import { Instance } from "../instance";

// Step bodies. No `cloudflare:workers` dep so the bun test runtime can
// import and execute them directly. Mirrors the pattern in
// `document/processing/deletion-steps.ts`.
//
// Order matters in the workflow but each step is independently idempotent
// and safe to retry. Workflow steps run sequentially:
//
//   1. destroyAllDocuments — for each catalog doc: destroy DocumentDO + R2
//   2. destroyAllConversations — for each catalog conv: destroy ChatAgent
//   3. destroyBinder — wipe per-user BinderDO storage
//   4. sweepUserR2 — safety-net sweep under `users/{userId}/` for any
//      keys the per-doc step missed
//   5. deleteAuthUser — drop the user row from D1; FK cascades remove
//      sessions, accounts, profile, billing, usage, provider settings

export type AccountDeletionParams = { userId: string };

// Tear down every DocumentDO + R2 prefix owned by this user.
// Reads document IDs from BinderDO (still alive at this point).
// Empty list (or already-gone BinderDO) → no-op.
export const destroyAllDocuments = async (input: AccountDeletionParams): Promise<void> => {
  const binder = Binder.require(input.userId);
  const rows = await binder.listDocuments();
  for (const row of rows) {
    await DocumentBinding.require(row.documentId).destroy();
    await DocumentAssetStore.removeAll(input.userId, row.documentId);
  }
};

// Tear down every ChatAgent DO owned by this user. Reads conversation
// IDs from BinderDO. ChatAgent.destroy is binding-level idempotent.
export const destroyAllConversations = async (input: AccountDeletionParams): Promise<void> => {
  const binder = Binder.require(input.userId);
  const rows = await binder.listConversations();
  for (const row of rows) {
    await Agent.destroy(input.userId, row.conversationId);
  }
};

// Wipe the per-user BinderDO storage. Idempotent.
export const destroyBinder = async (input: AccountDeletionParams): Promise<void> => {
  await Binder.require(input.userId).destroy();
};

// Safety-net R2 sweep under the user prefix. Per-document `removeAll`
// already swept the well-known paths; this catches anything else the
// pipeline may have stashed under the user (e.g. orphan blobs from a
// failed processing run that never made it into the catalog).
export const sweepUserR2 = async (input: AccountDeletionParams): Promise<void> => {
  const bucket = Config.requireR2Bucket();
  const prefix = `users/${input.userId}/`;
  let cursor: string | undefined;
  while (true) {
    const page = await bucket.list({ prefix, cursor });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) await bucket.delete(keys);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
};

// Drop the user row. D1 FK cascades fire here: session, account, profile,
// subscription, usage_period, usage_event, user_provider_settings.
// Idempotent — deleting an already-gone row returns 0 affected rows.
export const deleteAuthUser = async (input: AccountDeletionParams): Promise<void> => {
  await Instance.db.delete(user).where(eq(user.id, input.userId));
};

// Inline runner used by tests via the fake DELETE_USER binding. Same
// terminal state as the workflow run (each step is idempotent and replay-
// safe, so re-running mid-sequence after a partial failure is fine).
export const runDeletionInline = async (input: AccountDeletionParams): Promise<void> => {
  await destroyAllDocuments(input);
  await destroyAllConversations(input);
  await destroyBinder(input);
  await sweepUserR2(input);
  await deleteAuthUser(input);
};
