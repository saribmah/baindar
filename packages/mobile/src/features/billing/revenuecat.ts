import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";
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
  offerings: PurchasesOfferings;
  customerInfo: CustomerInfo;
};

// Public RC API key per platform — safe to ship in EXPO_PUBLIC_* env vars
// (they identify the project + app, not the org-wide secret). Missing key
// = mobile purchase is disabled; the rest of the billing UI still works
// via /billing/me.
export const getPublicApiKey = (): string | null => {
  if (Platform.OS === "ios") {
    const raw = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }
  if (Platform.OS === "android") {
    const raw = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }
  return null;
};

// Configure RC once per app boot and prefetch the offerings + customer
// info. The caller decides what to do with each step's outcome; we never
// throw from the happy paths. Subsequent calls with the same appUserId
// reuse the existing native session.
export const initRevenueCat = async (
  appUserId: string,
): Promise<{ handle: RevenueCatHandle } | { reason: RevenueCatNotConfiguredReason }> => {
  const apiKey = getPublicApiKey();
  if (!apiKey) return { reason: "missing_api_key" };
  try {
    Purchases.configure({ apiKey, appUserID: appUserId });
  } catch (err) {
    console.warn("[billing] RevenueCat configure failed", err);
    return { reason: "configure_failed" };
  }
  const [offerings, customerInfo] = await Promise.all([
    Purchases.getOfferings(),
    Purchases.getCustomerInfo(),
  ]);
  return { handle: { offerings, customerInfo } };
};

export const findPackageForPlan = (
  offerings: PurchasesOfferings,
  plan: BillingPlan,
): PurchasesPackage | null => {
  const lookupKey = PACKAGE_KEY_BY_PLAN[plan];
  if (!lookupKey) return null;
  const offering = offerings.current ?? Object.values(offerings.all)[0] ?? null;
  if (!offering) return null;
  return offering.availablePackages.find((p) => p.identifier === lookupKey) ?? null;
};

// Returns true when the RC SDK error is a user-cancellation. We treat that
// silently (no error banner) because the user already knows they canceled.
export const isUserCancelledError = (err: unknown): boolean => {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
};

export { Purchases };
