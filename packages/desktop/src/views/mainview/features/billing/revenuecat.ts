import {
  type CustomerInfo,
  ErrorCode,
  type Offerings,
  type Package,
  Purchases,
  PurchasesError,
} from "@revenuecat/purchases-js";
import { BillingPlan } from "@baindar/sdk";

// RC package lookup_keys we created via the MCP. Kept here so the UI's
// plan → package resolution lives in one place; if we add yearly packages
// later, this is the only file that has to learn the new key.
const PACKAGE_KEY_BY_PLAN: Partial<Record<BillingPlan, string>> = {
  [BillingPlan.Personal]: "$rc_custom_personal_monthly",
  [BillingPlan.Pro]: "$rc_custom_pro_monthly",
  [BillingPlan.Byok]: "$rc_custom_byok_monthly",
};

export type RevenueCatNotConfiguredReason = "missing_api_key" | "configure_failed";

export type RevenueCatHandle = {
  purchases: Purchases;
  offerings: Offerings;
  customerInfo: CustomerInfo;
};

// Read the public Web Billing API key from the Vite env. Public RC web
// keys are safe to ship to the client (they identify the project + app,
// not the org-wide secret). Missing key = web purchase is disabled (the
// rest of the billing UI still works via /billing/me).
export const getWebBillingApiKey = (): string | null => {
  const raw = import.meta.env.VITE_REVENUECAT_WEB_BILLING_API_KEY;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
};

// Configure RC once per app boot (idempotent — re-calls return the existing
// shared instance) and prefetch the offerings + customer info. The caller
// decides what to do with each step's outcome; we never throw from the
// happy paths.
export const initRevenueCat = async (
  appUserId: string,
): Promise<{ handle: RevenueCatHandle } | { reason: RevenueCatNotConfiguredReason }> => {
  const apiKey = getWebBillingApiKey();
  if (!apiKey) return { reason: "missing_api_key" };

  let purchases: Purchases;
  try {
    purchases = Purchases.isConfigured()
      ? Purchases.getSharedInstance()
      : Purchases.configure({ apiKey, appUserId });
  } catch (err) {
    console.warn("[billing] RevenueCat configure failed", err);
    return { reason: "configure_failed" };
  }

  const [offerings, customerInfo] = await Promise.all([
    purchases.getOfferings(),
    purchases.getCustomerInfo(),
  ]);
  return { handle: { purchases, offerings, customerInfo } };
};

// Resolve the RC package for a given plan from the current offering. Returns
// null when the plan isn't sold via Web Billing (e.g. before Stripe is
// linked) so the UI can show "Unavailable" instead of crashing.
export const findPackageForPlan = (offerings: Offerings, plan: BillingPlan): Package | null => {
  const lookupKey = PACKAGE_KEY_BY_PLAN[plan];
  if (!lookupKey) return null;
  const offering = offerings.current ?? Object.values(offerings.all)[0] ?? null;
  if (!offering) return null;
  return offering.availablePackages.find((p) => p.identifier === lookupKey) ?? null;
};

// Returns true when the RC SDK error is a user-cancellation. We treat that
// silently (no error banner) because the user already knows they canceled.
export const isUserCancelledError = (err: unknown): boolean => {
  return err instanceof PurchasesError && err.errorCode === ErrorCode.UserCancelledError;
};
