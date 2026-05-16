import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { Billing } from "../billing";
import { BillingStore } from "../billing-store";

// Polar webhook payloads go through Billing.applyPolarEvent → BillingStore
// upsert. These tests exercise the mapping + downgrade rules with a real
// SQLite-backed billing row, isolated from any HTTP/webhook framing.
//
// The test runtime seeds Polar product IDs via envOverrides so
// Config.getPolarPlanForProduct resolves them. We do NOT need the access
// token / webhook secret for these tests — they only matter for
// buildUpgradeUrls, which is tested separately.

const PROD_PERSONAL = "prod_personal_xyz";
const PROD_PRO = "prod_pro_xyz";
const PROD_BYOK = "prod_byok_xyz";

const baseEvent = (
  overrides: Partial<Billing.PolarSubscriptionEvent> = {},
): Billing.PolarSubscriptionEvent => ({
  kind: "created",
  subscriptionId: "sub_test",
  productId: PROD_PRO,
  externalUserId: "user-a",
  customerId: "cus_test",
  status: "active",
  currentPeriodStart: new Date("2026-05-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-06-01T00:00:00Z"),
  cancelAtPeriodEnd: false,
  ...overrides,
});

describe("Billing.applyPolarEvent", () => {
  let runtime: ReturnType<typeof createTestRuntime>;
  beforeEach(() => {
    runtime = createTestRuntime([{ id: "user-a", name: "Alice", email: "alice@example.com" }], {
      POLAR_PRODUCT_PERSONAL: PROD_PERSONAL,
      POLAR_PRODUCT_PRO: PROD_PRO,
      POLAR_PRODUCT_BYOK: PROD_BYOK,
    });
  });
  afterEach(() => {
    runtime.close();
  });

  it("upserts a pro subscription on subscription.created", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub).not.toBeNull();
      expect(sub?.plan).toBe("pro");
      expect(sub?.status).toBe("active");
      expect(sub?.providerSubscriptionId).toBe("sub_test");
      expect(sub?.providerCustomerId).toBe("cus_test");
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });

  it("maps personal product id to plan=personal", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent({ productId: PROD_PERSONAL }));
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("personal");
    });
  });

  it("maps byok product id to plan=byok", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent({ productId: PROD_BYOK }));
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("byok");
    });
  });

  it("ignores events with no externalUserId (cannot resolve a user)", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent({ externalUserId: null }));
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub).toBeNull();
    });
  });

  it("ignores events with an unknown productId so a bad webhook can't corrupt the plan", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(baseEvent({ productId: "prod_does_not_exist" }));
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
    });
  });

  it("scheduled cancellation (cancelAtPeriodEnd=true) keeps the paid plan until end", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(
        baseEvent({ kind: "canceled", cancelAtPeriodEnd: true, status: "active" }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.cancelAtPeriodEnd).toBe(true);
    });
  });

  it("immediate cancellation (cancelAtPeriodEnd=false) downgrades to free", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(
        baseEvent({ kind: "canceled", cancelAtPeriodEnd: false, status: "canceled" }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("free");
    });
  });

  it("revocation downgrades to free", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(
        baseEvent({ kind: "revoked", cancelAtPeriodEnd: false, status: "canceled" }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("free");
    });
  });

  it("re-delivery of the same created event is idempotent", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(baseEvent());
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.providerSubscriptionId).toBe("sub_test");
    });
  });

  it("uncancel after a scheduled cancellation flips cancelAtPeriodEnd back to false", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyPolarEvent(baseEvent());
      await Billing.applyPolarEvent(
        baseEvent({ kind: "canceled", cancelAtPeriodEnd: true, status: "active" }),
      );
      await Billing.applyPolarEvent(
        baseEvent({ kind: "uncanceled", cancelAtPeriodEnd: false, status: "active" }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });
});
