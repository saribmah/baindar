import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestRuntime } from "../../document/__tests__/test-db";
import { Billing } from "../billing";
import { BillingStore } from "../billing-store";

// RevenueCat snapshots flow through Billing.applyRevenueCatSnapshot →
// BillingStore upsert. These tests exercise the entitlement → plan mapping
// and the multi-entitlement priority rule with a real SQLite-backed billing
// row, isolated from the webhook handler + the network fetch.
//
// The test runtime seeds RC entitlement IDs via envOverrides so
// Config.getRevenueCatPlanForEntitlement resolves them. We do NOT need the
// REST API key — these tests construct snapshots directly instead of
// hitting RC.

const ENT_PERSONAL = "entl_personal_test";
const ENT_PRO = "entl_pro_test";
const ENT_BYOK = "entl_byok_test";

const baseSnapshot = (
  overrides: Partial<Billing.RevenueCatSubscriberSnapshot> = {},
): Billing.RevenueCatSubscriberSnapshot => ({
  appUserId: "user-a",
  customerId: "user-a",
  activeEntitlements: [
    {
      entitlementId: ENT_PRO,
      productId: "com.baindar.app.pro.monthly",
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      willRenew: true,
      store: "rc_billing",
    },
  ],
  managementUrl: null,
  ...overrides,
});

describe("Billing.applyRevenueCatSnapshot", () => {
  let runtime: ReturnType<typeof createTestRuntime>;
  beforeEach(() => {
    runtime = createTestRuntime([{ id: "user-a", name: "Alice", email: "alice@example.com" }], {
      REVENUECAT_ENTITLEMENT_PERSONAL: ENT_PERSONAL,
      REVENUECAT_ENTITLEMENT_PRO: ENT_PRO,
      REVENUECAT_ENTITLEMENT_BYOK: ENT_BYOK,
    });
  });
  afterEach(() => {
    runtime.close();
  });

  it("upserts a pro subscription when the pro entitlement is active", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub).not.toBeNull();
      expect(sub?.plan).toBe("pro");
      expect(sub?.status).toBe("active");
      expect(sub?.providerSubscriptionId).toBe("com.baindar.app.pro.monthly");
      expect(sub?.providerCustomerId).toBe("user-a");
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });

  it("maps the personal entitlement to plan=personal", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: ENT_PERSONAL,
              productId: "com.baindar.app.personal.monthly",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
          ],
        }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("personal");
    });
  });

  it("maps the byok entitlement to plan=byok", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: ENT_BYOK,
              productId: "com.baindar.app.byok.monthly",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
          ],
        }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("byok");
    });
  });

  it("downgrades to free when no active entitlements remain", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      await Billing.applyRevenueCatSnapshot(baseSnapshot({ activeEntitlements: [] }));
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("free");
      expect(sub?.providerSubscriptionId).toBeNull();
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });

  it("ignores unknown entitlement ids so a bad webhook can't corrupt the plan", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: "entl_does_not_exist",
              productId: "",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
          ],
        }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      // Snapshot only contained unknown entitlements → treated as none →
      // user downgrades to free, which protects us from a bad webhook
      // silently keeping someone on a paid plan when RC says otherwise.
      expect(sub?.plan).toBe("free");
    });
  });

  it("scheduled cancellation (willRenew=false) keeps the paid plan but flags cancelAtPeriodEnd", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: ENT_PRO,
              productId: "com.baindar.app.pro.monthly",
              expiresAt: new Date("2026-06-01T00:00:00Z"),
              willRenew: false,
              store: "rc_billing",
            },
          ],
        }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.cancelAtPeriodEnd).toBe(true);
    });
  });

  it("re-delivery of the same snapshot is idempotent", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.providerSubscriptionId).toBe("com.baindar.app.pro.monthly");
    });
  });

  it("uncancel after a scheduled cancellation flips cancelAtPeriodEnd back to false", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: ENT_PRO,
              productId: "com.baindar.app.pro.monthly",
              expiresAt: new Date("2026-06-01T00:00:00Z"),
              willRenew: false,
              store: "rc_billing",
            },
          ],
        }),
      );
      await Billing.applyRevenueCatSnapshot(baseSnapshot());
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
      expect(sub?.cancelAtPeriodEnd).toBe(false);
    });
  });

  it("multi-entitlement snapshot prefers the highest-value plan", async () => {
    await runtime.runAs("user-a", async () => {
      await Billing.applyRevenueCatSnapshot(
        baseSnapshot({
          activeEntitlements: [
            {
              entitlementId: ENT_PERSONAL,
              productId: "com.baindar.app.personal.monthly",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
            {
              entitlementId: ENT_PRO,
              productId: "com.baindar.app.pro.monthly",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
            {
              entitlementId: ENT_BYOK,
              productId: "com.baindar.app.byok.monthly",
              expiresAt: null,
              willRenew: true,
              store: "rc_billing",
            },
          ],
        }),
      );
      const sub = await BillingStore.getSubscription("user-a");
      expect(sub?.plan).toBe("pro");
    });
  });
});
