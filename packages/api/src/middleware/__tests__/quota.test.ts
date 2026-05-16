import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../../app/context";
import { Billing } from "../../billing/billing";
import { BillingStore } from "../../billing/billing-store";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { ProviderStore } from "../../provider/provider-store";
import { requireChatQuota, requireSummarizeQuota } from "../quota";

const TEST_ENCRYPTION_KEY = "Q1mZ8oP9o3xKLLwM/jw3qb0H6L2nF6Pp/dXR5N6m9KE=";

// Quota middleware is wired into the chat + summarize routes ahead of the
// model call. These tests exercise it against a minimal Hono app so the
// "request, gated, response" loop is real — no shortcuts via direct calls
// with a mock context.

const buildApp = (kind: "chat" | "summary") => {
  const app = new Hono<AppEnv>();
  const middleware = kind === "chat" ? requireChatQuota : requireSummarizeQuota;
  app.get("/gated", middleware, (c) => c.json({ ok: true }));
  return app;
};

describe("quota middleware", () => {
  let runtime: ReturnType<typeof createTestRuntime>;
  beforeEach(() => {
    runtime = createTestRuntime([{ id: "user-a", name: "Alice", email: "alice@example.com" }], {
      PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    });
  });
  afterEach(() => {
    runtime.close();
  });

  describe("requireChatQuota", () => {
    it("passes through when the user has chat turns remaining", async () => {
      const app = buildApp("chat");
      await runtime.runAs("user-a", async () => {
        const res = await app.request("/gated");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);
      });
    });

    it("returns 402 with a structured payload when chat quota is exhausted", async () => {
      const app = buildApp("chat");
      await runtime.runAs("user-a", async () => {
        // Free plan = 30 chat turns. Burn them all without enforcement.
        for (let i = 0; i < 30; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 1,
            outputTokens: 1,
          });
        }
        const res = await app.request("/gated");
        expect(res.status).toBe(402);
        const body = (await res.json()) as {
          name: string;
          data: { kind: string; plan: string; limit: number; periodResetAt: string };
        };
        expect(body.name).toBe("BillingQuotaExceededError");
        expect(body.data.kind).toBe("chat");
        expect(body.data.plan).toBe("free");
        expect(body.data.limit).toBe(30);
        expect(body.data.periodResetAt).toBeDefined();
      });
    });

    it("returns 428 when BYOK plan has no provider configured (prevents free use of platform key)", async () => {
      const app = buildApp("chat");
      await runtime.runAs("user-a", async () => {
        await BillingStore.upsertSubscriptionFromPolar({
          userId: "user-a",
          plan: "byok",
          status: "active",
          providerCustomerId: "cus_byok",
          providerSubscriptionId: "sub_byok",
          currentPeriodStart: new Date("2026-05-01T00:00:00Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00Z"),
          cancelAtPeriodEnd: false,
        });
        const res = await app.request("/gated");
        expect(res.status).toBe(428);
        const body = (await res.json()) as { name: string; data: { plan: string } };
        expect(body.name).toBe("ProviderNotConfiguredError");
        expect(body.data.plan).toBe("byok");
      });
    });

    it("allows BYOK users with a configured provider through, ignoring usage counters", async () => {
      const app = buildApp("chat");
      await runtime.runAs("user-a", async () => {
        await BillingStore.upsertSubscriptionFromPolar({
          userId: "user-a",
          plan: "byok",
          status: "active",
          providerCustomerId: "cus_byok",
          providerSubscriptionId: "sub_byok",
          currentPeriodStart: new Date("2026-05-01T00:00:00Z"),
          currentPeriodEnd: new Date("2026-06-01T00:00:00Z"),
          cancelAtPeriodEnd: false,
        });
        await ProviderStore.upsertSettings({
          userId: "user-a",
          spec: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          model: "claude-sonnet-4-5",
          encryptedApiKey: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 99]),
          keyLastFour: "abcd",
          lastValidatedAt: new Date(),
        });
        // Burn fake usage — should still pass through because BYOK + configured.
        for (let i = 0; i < 50; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 1,
            outputTokens: 1,
            byok: true,
          });
        }
        const res = await app.request("/gated");
        expect(res.status).toBe(200);
      });
    });
  });

  describe("requireSummarizeQuota", () => {
    it("passes through when the user has summary credits remaining", async () => {
      const app = buildApp("summary");
      await runtime.runAs("user-a", async () => {
        const res = await app.request("/gated");
        expect(res.status).toBe(200);
      });
    });

    it("returns 402 when summary quota is exhausted", async () => {
      const app = buildApp("summary");
      await runtime.runAs("user-a", async () => {
        // Free plan = 20 summaries.
        for (let i = 0; i < 20; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "summary",
            inputTokens: 1,
            outputTokens: 1,
          });
        }
        const res = await app.request("/gated");
        expect(res.status).toBe(402);
        const body = (await res.json()) as { data: { kind: string; plan: string; limit: number } };
        expect(body.data.kind).toBe("summary");
        expect(body.data.limit).toBe(20);
      });
    });

    it("chat usage does not block summary requests (independent counters)", async () => {
      const app = buildApp("summary");
      await runtime.runAs("user-a", async () => {
        for (let i = 0; i < 30; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 1,
            outputTokens: 1,
          });
        }
        const res = await app.request("/gated");
        expect(res.status).toBe(200);
      });
    });
  });
});
