import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Binder } from "../../binder/binder";
import { Conversation } from "../../conversation/conversation";
import { account, user } from "../../db/schema";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";
import { Instance } from "../../instance";
import { AccountDeletion } from "../account-deletion";
import {
  deleteAuthUser,
  deleteRevenueCatSubscriber,
  destroyAllConversations,
  destroyAllDocuments,
  destroyBinder,
  revokeAppleTokens,
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

    it("revokeAppleTokens no-ops when Apple revoke is not configured", async () => {
      // Default test runtime has no APPLE_* secrets, so the step short-
      // circuits before issuing any network call. Seed an Apple account
      // row so we'd notice if it tried.
      await runtime.runAs(userA, async () => {
        await Instance.db.insert(account).values({
          id: "acc-a-apple",
          accountId: "apple-sub-a",
          providerId: "apple",
          userId: userA,
          refreshToken: "rt_test",
          accessToken: "at_test",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await revokeAppleTokens({ userId: userA });
      });
    });

    it("revokeAppleTokens skips users who never used Sign in with Apple", async () => {
      const env = await buildAppleRevokeEnv();
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        env.envOverrides,
      );
      const originalFetch = globalThis.fetch;
      const calls: Array<{ url: string }> = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          // No Apple `account` row exists for this user. Should be a no-op.
          await revokeAppleTokens({ userId: userA });
        });
        expect(calls).toHaveLength(0);
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
    });

    it("revokeAppleTokens POSTs an ES256-signed client_secret to Apple", async () => {
      const env = await buildAppleRevokeEnv();
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        env.envOverrides,
      );
      const originalFetch = globalThis.fetch;
      const calls: Array<{ url: string; method: string; body: string }> = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : "";
        calls.push({ url, method: init?.method ?? "GET", body: bodyText });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          await Instance.db.insert(account).values({
            id: "acc-a-apple",
            accountId: "apple-sub-a",
            providerId: "apple",
            userId: userA,
            refreshToken: "the_refresh_token",
            accessToken: "the_access_token",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await revokeAppleTokens({ userId: userA });
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe("https://appleid.apple.com/auth/revoke");
        expect(calls[0]?.method).toBe("POST");

        const params = new URLSearchParams(calls[0]?.body ?? "");
        expect(params.get("client_id")).toBe(env.clientId);
        expect(params.get("token")).toBe("the_refresh_token");
        expect(params.get("token_type_hint")).toBe("refresh_token");

        // Verify the JWT structure + signature so a regression in the
        // signer (wrong curve, bad key import, DER vs P1363) is caught
        // here rather than at Apple.
        const jwt = params.get("client_secret") ?? "";
        const [headerB64, payloadB64, sigB64] = jwt.split(".");
        const header = JSON.parse(base64UrlDecodeToString(headerB64 ?? ""));
        const payload = JSON.parse(base64UrlDecodeToString(payloadB64 ?? ""));
        expect(header).toMatchObject({ alg: "ES256", kid: env.keyId, typ: "JWT" });
        expect(payload).toMatchObject({
          iss: env.teamId,
          aud: "https://appleid.apple.com",
          sub: env.clientId,
        });
        expect(typeof payload.iat).toBe("number");
        expect(payload.exp).toBeGreaterThan(payload.iat);

        const sigBytes = base64UrlDecode(sigB64 ?? "");
        const valid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          env.publicKey,
          sigBytes.buffer as ArrayBuffer,
          new TextEncoder().encode(`${headerB64}.${payloadB64}`),
        );
        expect(valid).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
    });

    it("revokeAppleTokens treats Apple's invalid_grant as success (idempotent retries)", async () => {
      const env = await buildAppleRevokeEnv();
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        env.envOverrides,
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          await Instance.db.insert(account).values({
            id: "acc-a-apple",
            accountId: "apple-sub-a",
            providerId: "apple",
            userId: userA,
            refreshToken: "already_revoked",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await revokeAppleTokens({ userId: userA });
        });
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
    });

    it("revokeAppleTokens throws on unexpected non-2xx responses so the step can retry", async () => {
      const env = await buildAppleRevokeEnv();
      const rcRuntime = createTestRuntime(
        [{ id: userA, name: "Alice", email: "alice@example.com" }],
        env.envOverrides,
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response("server error", { status: 500 })) as unknown as typeof fetch;

      try {
        await rcRuntime.runAs(userA, async () => {
          await Instance.db.insert(account).values({
            id: "acc-a-apple",
            accountId: "apple-sub-a",
            providerId: "apple",
            userId: userA,
            refreshToken: "rt",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await expect(revokeAppleTokens({ userId: userA })).rejects.toThrow(
            /Apple revoke failed: 500/,
          );
        });
      } finally {
        globalThis.fetch = originalFetch;
        rcRuntime.close();
      }
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

// Generates a fresh ES256 keypair and the env-var overrides needed to
// drive Config.getAppleRevoke(). Returns the public key so tests can
// verify the JWT signature the revoke step produces.
async function buildAppleRevokeEnv(): Promise<{
  clientId: string;
  teamId: string;
  keyId: string;
  publicKey: CryptoKey;
  envOverrides: Record<string, string>;
}> {
  const keypair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keypair.privateKey);
  const pem = pkcs8ToPem(new Uint8Array(pkcs8));
  return {
    clientId: "com.baindar.app.signin",
    teamId: "TEAMID1234",
    keyId: "KEYID12345",
    publicKey: keypair.publicKey,
    envOverrides: {
      APPLE_CLIENT_ID: "com.baindar.app.signin",
      APPLE_TEAM_ID: "TEAMID1234",
      APPLE_KEY_ID: "KEYID12345",
      APPLE_PRIVATE_KEY: pem,
    },
  };
}

function pkcs8ToPem(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}
