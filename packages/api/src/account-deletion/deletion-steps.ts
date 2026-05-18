import { and, eq } from "drizzle-orm";
import { Agent } from "../agent/agent";
import { RevenueCat } from "../billing/revenuecat";
import { Binder } from "../binder/binder";
import { account, user } from "../db/schema";
import { DocumentAssetStore } from "../document/asset-store";
import { DocumentBinding } from "../document/document-binding";
import { Config } from "../config/config";
import { Instance } from "../instance";
import { AppleRevoke } from "./apple-revoke";

// Step bodies. No `cloudflare:workers` dep so the bun test runtime can
// import and execute them directly. Mirrors the pattern in
// `document/processing/deletion-steps.ts`.
//
// Order matters in the workflow but each step is independently idempotent
// and safe to retry. Workflow steps run sequentially:
//
//   1. revokeAppleTokens — for each Apple `account` row, call Apple's
//      REST revoke endpoint. Must run BEFORE deleteAuthUser because the
//      account rows cascade-delete with the user row, and we need the
//      refresh tokens to issue the revoke. Without this, a user who
//      signs back in with the same Apple ID gets a new sign-up that
//      breaks: Apple only shares email on the first authorization per
//      (Apple ID, app), so re-auth without a revoke returns a `sub` with
//      no email, and our `user.email NOT NULL` constraint blocks the
//      insert. Also required by App Store guideline 5.1.1(v).
//   2. deleteAuthUser — drop the user row from D1; FK cascades remove
//      sessions, accounts, profile, billing, usage, and provider
//      settings. Closes off every sign-in path before we start tearing
//      down user-owned storage, so a user who taps "delete" and then
//      immediately tries to sign in again cannot land back in a
//      half-deleted account. BinderDO is keyed by `idFromName(userId)`
//      and lives independently of the D1 row, so the remaining steps
//      can still enumerate documents/conversations.
//   3. destroyAllDocuments — for each catalog doc: destroy DocumentDO + R2
//   4. destroyAllConversations — for each catalog conv: destroy ChatAgent
//   5. destroyBinder — wipe per-user BinderDO storage
//   6. sweepUserR2 — safety-net sweep under `users/{userId}/` for any
//      keys the per-doc step missed
//   7. deleteRevenueCatSubscriber — free the RC app_user_id and drop
//      subscriber attributes. Does NOT cancel the underlying App Store /
//      Play Store subscription — that's tied to the platform account and
//      must be cancelled by the user via their platform settings. The
//      delete dialogs surface this to the user before they confirm.

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

// Revoke every Sign in with Apple token owned by this user via Apple's
// REST endpoint. No-op when Apple revoke isn't configured (e.g. local
// dev without the .p8 key) so the workflow still completes. Idempotent:
// Apple returns `invalid_grant` for already-revoked tokens and
// AppleRevoke.revokeToken treats that as success.
//
// Must run BEFORE deleteAuthUser — the FK cascade on `user.id` deletes
// the `account` rows where we read the refresh tokens from.
export const revokeAppleTokens = async (input: AccountDeletionParams): Promise<void> => {
  const rows = await Instance.db
    .select({
      refreshToken: account.refreshToken,
      accessToken: account.accessToken,
    })
    .from(account)
    .where(and(eq(account.userId, input.userId), eq(account.providerId, "apple")));

  for (const row of rows) {
    // Prefer refresh token; fall back to access token if for some reason
    // the refresh token is missing (Apple sometimes omits it on re-auth).
    const token = row.refreshToken ?? row.accessToken;
    if (!token) continue;
    await AppleRevoke.revokeToken(token);
  }
};

// Drop the user row. D1 FK cascades fire here: session, account, profile,
// subscription, usage_period, usage_event, user_provider_settings.
// Idempotent — deleting an already-gone row returns 0 affected rows.
export const deleteAuthUser = async (input: AccountDeletionParams): Promise<void> => {
  await Instance.db.delete(user).where(eq(user.id, input.userId));
};

// Remove the RevenueCat subscriber record. Idempotent — 404 is treated as
// success and the call no-ops when RC isn't configured. Does NOT cancel
// the underlying platform subscription; the delete dialogs warn the user.
export const deleteRevenueCatSubscriber = async (input: AccountDeletionParams): Promise<void> => {
  await RevenueCat.deleteSubscriber(input.userId);
};

// Inline runner used by tests via the fake DELETE_USER binding. Same
// terminal state as the workflow run (each step is idempotent and replay-
// safe, so re-running mid-sequence after a partial failure is fine).
export const runDeletionInline = async (input: AccountDeletionParams): Promise<void> => {
  await revokeAppleTokens(input);
  await deleteAuthUser(input);
  await destroyAllDocuments(input);
  await destroyAllConversations(input);
  await destroyBinder(input);
  await sweepUserR2(input);
  await deleteRevenueCatSubscriber(input);
};
