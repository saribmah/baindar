import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { Billing } from "../billing";

describe("Billing feature", () => {
  let runtime: ReturnType<typeof createTestRuntime>;
  beforeEach(() => {
    runtime = createTestRuntime([
      { id: "user-a", name: "Alice", email: "alice@example.com" },
      { id: "user-b", name: "Bob", email: "bob@example.com" },
    ]);
  });
  afterEach(() => {
    runtime.close();
  });

  describe("getQuotaForPlan", () => {
    it("returns finite caps for paid + free plans and unlimited for byok", () => {
      expect(Billing.getQuotaForPlan("free").chatTurnsLimit).toBe(30);
      expect(Billing.getQuotaForPlan("personal").chatTurnsLimit).toBe(300);
      expect(Billing.getQuotaForPlan("pro").chatTurnsLimit).toBe(1000);
      expect(Billing.getQuotaForPlan("byok").chatTurnsLimit).toBe(-1);
    });
  });

  describe("estimateCostMicros", () => {
    it("matches Sonnet input + output micros math", () => {
      expect(Billing.estimateCostMicros(0, 0)).toBe(0);
      expect(Billing.estimateCostMicros(1_000, 0)).toBe(3_000);
      expect(Billing.estimateCostMicros(0, 1_000)).toBe(15_000);
      expect(Billing.estimateCostMicros(1_000, 1_000)).toBe(18_000);
    });
  });

  describe("getStatus", () => {
    it("lazy-creates a free subscription and zeroed period on first read", async () => {
      await runtime.runAs("user-a", async () => {
        const status = await Billing.getStatus("user-a");
        expect(status.plan).toBe("free");
        expect(status.status).toBe("active");
        expect(status.quota.chatTurnsLimit).toBe(30);
        expect(status.currentPeriod.chatTurns).toBe(0);
        expect(status.currentPeriod.summaries).toBe(0);
        expect(status.cancelAtPeriodEnd).toBe(false);
      });
    });

    it("is idempotent — second read returns the same row without duplicating", async () => {
      await runtime.runAs("user-a", async () => {
        const first = await Billing.getStatus("user-a");
        const second = await Billing.getStatus("user-a");
        expect(second.currentPeriod.periodStart).toBe(first.currentPeriod.periodStart);
        expect(second.currentPeriod.periodEnd).toBe(first.currentPeriod.periodEnd);
      });
    });
  });

  describe("recordUsage", () => {
    it("increments chat_turns and token counters when kind=chat", async () => {
      await runtime.runAs("user-a", async () => {
        await Billing.recordUsage({
          userId: "user-a",
          kind: "chat",
          inputTokens: 1_000,
          outputTokens: 500,
          sourceId: "conv-1",
        });
        const status = await Billing.getStatus("user-a");
        expect(status.currentPeriod.chatTurns).toBe(1);
        expect(status.currentPeriod.summaries).toBe(0);
        expect(status.currentPeriod.inputTokens).toBe(1_000);
        expect(status.currentPeriod.outputTokens).toBe(500);
        expect(status.currentPeriod.costUsdMicros).toBe(Billing.estimateCostMicros(1_000, 500));
      });
    });

    it("increments summaries instead of chat_turns when kind=summary", async () => {
      await runtime.runAs("user-a", async () => {
        await Billing.recordUsage({
          userId: "user-a",
          kind: "summary",
          inputTokens: 500,
          outputTokens: 250,
        });
        const status = await Billing.getStatus("user-a");
        expect(status.currentPeriod.chatTurns).toBe(0);
        expect(status.currentPeriod.summaries).toBe(1);
        expect(status.currentPeriod.inputTokens).toBe(500);
      });
    });

    it("accumulates across multiple recordings", async () => {
      await runtime.runAs("user-a", async () => {
        for (let i = 0; i < 3; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 100,
            outputTokens: 50,
          });
        }
        const status = await Billing.getStatus("user-a");
        expect(status.currentPeriod.chatTurns).toBe(3);
        expect(status.currentPeriod.inputTokens).toBe(300);
        expect(status.currentPeriod.outputTokens).toBe(150);
      });
    });

    it("does NOT increment quota counters for BYOK events but still records cost", async () => {
      await runtime.runAs("user-a", async () => {
        await Billing.recordUsage({
          userId: "user-a",
          kind: "chat",
          inputTokens: 10_000,
          outputTokens: 2_000,
          byok: true,
        });
        const status = await Billing.getStatus("user-a");
        // BYOK bypasses quota — chat_turns stays at zero so the user can
        // continue indefinitely on their own key.
        expect(status.currentPeriod.chatTurns).toBe(0);
        expect(status.currentPeriod.inputTokens).toBe(0);
      });
    });

    it("isolates usage between distinct users", async () => {
      await runtime.runAs("user-a", async () => {
        await Billing.recordUsage({
          userId: "user-a",
          kind: "chat",
          inputTokens: 100,
          outputTokens: 50,
        });
      });
      await runtime.runAs("user-b", async () => {
        const status = await Billing.getStatus("user-b");
        expect(status.currentPeriod.chatTurns).toBe(0);
        expect(status.currentPeriod.inputTokens).toBe(0);
      });
    });
  });

  describe("getRemainingQuota", () => {
    it("subtracts used from limit and surfaces -1 for unlimited", async () => {
      await runtime.runAs("user-a", async () => {
        const before = await Billing.getRemainingQuota("user-a");
        expect(before.chatTurns).toBe(30); // free plan
        expect(before.summaries).toBe(20);

        for (let i = 0; i < 5; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 1,
            outputTokens: 1,
          });
        }
        const after = await Billing.getRemainingQuota("user-a");
        expect(after.chatTurns).toBe(25);
      });
    });

    it("clamps remaining at 0 even when usage exceeds limit", async () => {
      // Phase 1 has no enforcement, so it's possible to record past the
      // limit. Remaining should clamp at 0 rather than going negative so
      // UI doesn't show "-3 turns left".
      await runtime.runAs("user-a", async () => {
        for (let i = 0; i < 35; i++) {
          await Billing.recordUsage({
            userId: "user-a",
            kind: "chat",
            inputTokens: 1,
            outputTokens: 1,
          });
        }
        const remaining = await Billing.getRemainingQuota("user-a");
        expect(remaining.chatTurns).toBe(0);
      });
    });
  });

  describe("getCurrentPeriodWindow", () => {
    it("returns the UTC calendar month containing `now`", () => {
      const mid = new Date(Date.UTC(2026, 4, 15, 13, 30, 0));
      const { start, end } = Billing.getCurrentPeriodWindow(mid);
      expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
      expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    });

    it("rolls into the next month at the boundary", () => {
      const lastInstant = new Date(Date.UTC(2026, 4, 31, 23, 59, 59, 999));
      const window = Billing.getCurrentPeriodWindow(lastInstant);
      expect(window.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
      expect(window.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    });
  });
});
