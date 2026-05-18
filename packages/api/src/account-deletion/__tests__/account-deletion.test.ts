import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Binder } from "../../binder/binder";
import { Conversation } from "../../conversation/conversation";
import { user } from "../../db/schema";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";
import { Instance } from "../../instance";
import { AccountDeletion } from "../account-deletion";
import {
  deleteAuthUser,
  deleteRevenueCatSubscriber,
  destroyAllConversations,
  destroyAllDocuments,
  destroyBinder,
  runDeletionInline,
  sweepUserR2,
} from "../deletion-steps";

describe("AccountDeletion", () => {
  const userA = "user-a";
  const userB = "user-b";
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime([
      { id: userA, name: "Alice", email: "alice@example.com" },
      { id: userB, name: "Bob", email: "bob@example.com" },
    ]);
  });

  afterEach(() => {
    runtime.close();
  });

  describe("steps", () => {
    it("destroyAllDocuments tears down every DocumentDO + R2 footprint", async () => {
      await runtime.runAs(userA, async () => {
        const doc1 = await seedBinderDocument(userA);
        const doc2 = await seedBinderDocument(userA);

        // Seed some R2 keys under each document so the per-doc sweep has
        // something to clear.
        const bucket = Instance.env.BUCKET as unknown as R2Bucket;
        await bucket.put(`users/${userA}/documents/${doc1.id}/original.epub`, new Uint8Array([1]));
        await bucket.put(`users/${userA}/documents/${doc2.id}/manifest.json`, "{}");

        await destroyAllDocuments({ userId: userA });

        const docs = await Binder.require(userA).listDocuments();
        // listDocuments stays intact at this step — the binder itself isn't
        // wiped until destroyBinder.
        expect(docs).toHaveLength(2);

        const remaining = await bucket.list({ prefix: `users/${userA}/` });
        expect(remaining.objects).toHaveLength(0);
      });
    });

    it("destroyAllConversations destroys every ChatAgent owned by the user", async () => {
      await runtime.runAs(userA, async () => {
        const c1 = await Conversation.create(userA, { title: "one" });
        const c2 = await Conversation.create(userA, { title: "two" });

        runtime.destroyedConversationIds.length = 0;
        await destroyAllConversations({ userId: userA });

        expect(runtime.destroyedConversationIds.sort()).toEqual([c1.id, c2.id].sort());
      });
    });

    it("destroyBinder wipes the per-user BinderDO storage", async () => {
      await runtime.runAs(userA, async () => {
        await seedBinderDocument(userA);
        await Conversation.create(userA, {});
        await destroyBinder({ userId: userA });

        expect(await Binder.require(userA).listDocuments()).toHaveLength(0);
        expect(await Binder.require(userA).listConversations()).toHaveLength(0);
      });
    });

    it("sweepUserR2 paginates through every key under the user prefix", async () => {
      await runtime.runAs(userA, async () => {
        const bucket = Instance.env.BUCKET as unknown as R2Bucket;
        await bucket.put(`users/${userA}/documents/x/original.epub`, new Uint8Array([1]));
        await bucket.put(`users/${userA}/orphan-blob`, new Uint8Array([2]));
        await bucket.put(`users/${userB}/documents/y/original.epub`, new Uint8Array([3]));

        await sweepUserR2({ userId: userA });

        const remaining = await bucket.list({ prefix: `users/${userA}/` });
        expect(remaining.objects).toHaveLength(0);
        const others = await bucket.list({ prefix: `users/${userB}/` });
        expect(others.objects).toHaveLength(1);
      });
    });

    it("deleteAuthUser removes the auth row and is idempotent", async () => {
      await runtime.runAs(userA, async () => {
        await deleteAuthUser({ userId: userA });
        const rows = await Instance.db.select().from(user).where(eq(user.id, userA));
        expect(rows).toHaveLength(0);

        // Second run on an already-deleted user is a no-op.
        await deleteAuthUser({ userId: userA });
      });
    });

    it("deleteRevenueCatSubscriber no-ops when RC is not configured", async () => {
      // Default test runtime has no REVENUECAT_* env vars, so the step
      // should silently skip the network call rather than throwing.
      await runtime.runAs(userA, async () => {
        await deleteRevenueCatSubscriber({ userId: userA });
      });
    });

    it("deleteRevenueCatSubscriber DELETEs against RC and treats 404 as success", async () => {
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        {
          REVENUECAT_PROJECT_ID: "proj_test",
          REVENUECAT_SECRET_API_KEY: "sk_test",
          REVENUECAT_WEBHOOK_AUTH: "wh_test",
        },
      );
      const calls: Array<{ method: string; url: string }> = [];
      const originalFetch = globalThis.fetch;
      let nextStatus = 200;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ method: init?.method ?? "GET", url });
        return new Response(null, { status: nextStatus });
      }) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          await deleteRevenueCatSubscriber({ userId: userA });
          nextStatus = 404;
          // Replay against an already-deleted subscriber should still succeed.
          await deleteRevenueCatSubscriber({ userId: userA });
        });
        expect(calls).toHaveLength(2);
        expect(calls[0]?.method).toBe("DELETE");
        expect(calls[0]?.url).toContain(`/v2/projects/proj_test/customers/${userA}`);
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
    });

    it("deleteRevenueCatSubscriber surfaces non-2xx/non-404 errors", async () => {
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        {
          REVENUECAT_PROJECT_ID: "proj_test",
          REVENUECAT_SECRET_API_KEY: "sk_test",
          REVENUECAT_WEBHOOK_AUTH: "wh_test",
        },
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response("boom", { status: 500 })) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          await expect(deleteRevenueCatSubscriber({ userId: userA })).rejects.toThrow(
            /deleteSubscriber failed: 500/,
          );
        });
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
    });
  });

  describe("runDeletionInline", () => {
    it("ends in a fully-wiped terminal state across binder, R2, and auth", async () => {
      await runtime.runAs(userA, async () => {
        await seedBinderDocument(userA);
        await Conversation.create(userA, {});
        const bucket = Instance.env.BUCKET as unknown as R2Bucket;
        await bucket.put(`users/${userA}/scratch`, new Uint8Array([42]));

        await runDeletionInline({ userId: userA });

        // Auth row gone.
        const rows = await Instance.db.select().from(user).where(eq(user.id, userA));
        expect(rows).toHaveLength(0);
        // Binder wiped.
        expect(await Binder.require(userA).listDocuments()).toHaveLength(0);
        expect(await Binder.require(userA).listConversations()).toHaveLength(0);
        // R2 prefix empty.
        const remaining = await bucket.list({ prefix: `users/${userA}/` });
        expect(remaining.objects).toHaveLength(0);
      });
    });

    it("only affects the requested user", async () => {
      await runtime.runAs(userA, () => seedBinderDocument(userA));
      const bDoc = await runtime.runAs(userB, () => seedBinderDocument(userB));

      await runtime.runAs(userA, () => runDeletionInline({ userId: userA }));

      await runtime.runAs(userB, async () => {
        const rows = await Instance.db.select().from(user).where(eq(user.id, userB));
        expect(rows).toHaveLength(1);
        const docs = await Binder.require(userB).listDocuments();
        expect(docs.map((d) => d.documentId)).toEqual([bDoc.id]);
      });
    });

    it("is replay-safe — running twice produces the same terminal state", async () => {
      await runtime.runAs(userA, async () => {
        await seedBinderDocument(userA);
        await Conversation.create(userA, {});

        await runDeletionInline({ userId: userA });
        await runDeletionInline({ userId: userA });

        const rows = await Instance.db.select().from(user).where(eq(user.id, userA));
        expect(rows).toHaveLength(0);
      });
    });
  });

  describe("request orchestrator", () => {
    it("enqueues the workflow (which runs inline in tests) and returns pending", async () => {
      await runtime.runAs(userA, async () => {
        await seedBinderDocument(userA);

        const result = await AccountDeletion.request(userA);
        expect(result).toEqual({ status: "pending", userId: userA });

        // The fake DELETE_USER binding runs the steps inline, so by the
        // time request() returns the user row is gone.
        const rows = await Instance.db.select().from(user).where(eq(user.id, userA));
        expect(rows).toHaveLength(0);
      });
    });
  });
});
