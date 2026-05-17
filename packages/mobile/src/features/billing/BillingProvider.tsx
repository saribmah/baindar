import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { type BillingPlan, type BillingStatus } from "@baindar/sdk";
import type { PurchasesOfferings } from "react-native-purchases";
import { authClient } from "../auth";
import { useSdk } from "../../sdk/sdk.provider";
import { findPackageForPlan, initRevenueCat, isUserCancelledError, Purchases } from "./revenuecat";

// Refresh cadence while the app is foregrounded. The /billing/me endpoint is
// two small D1 reads; 12s is fast enough that the Settings meter feels live
// during an active session without being a chatty background poll.
const POLL_MS = 12_000;

export type PurchaseOutcome =
  | { status: "success" }
  | { status: "cancelled" }
  | { status: "unavailable"; reason: "not_configured" | "no_package" }
  | { status: "error"; message: string };

type BillingContextValue = {
  billing: BillingStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  // RC-native purchase + manage. `purchasePlan` opens the platform's
  // native subscription sheet (StoreKit on iOS, Billing Library on
  // Android). `manageSubscriptionUrl` points at the App Store / Play Store
  // subscriptions page for the active subscription.
  purchasePlan: (plan: BillingPlan) => Promise<PurchaseOutcome>;
  manageSubscriptionUrl: string | null;
  rcReady: boolean;
  rcUnavailable: boolean;
};

const BillingContext = createContext<BillingContextValue | null>(null);

// Provider centralises the fetch + polls in the background so the Settings
// UsageMeter / BillingGroup stay current as the user chats from other tabs.
// Without polling, the SettingsScreen mounted once at first visit and never
// re-fetched (tab navigators keep screens mounted across tab switches).
//
// Gated on Better Auth session: until there's a signed-in user we don't
// fetch — avoids spamming /billing/me with 401s while the user is on
// landing/signin/signup. Resumes automatically once `useSession` reports
// a user.
//
// react-native-purchases is configured the first time the provider mounts
// under a signed-in user, with that user's id as appUserID so the webhook's
// app_user_id can resolve back to our subscription row.
export function BillingProvider({ children }: { children: ReactNode }) {
  const { client } = useSdk();
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;
  const isAuthed = !!session.data?.user;

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [manageSubscriptionUrl, setManageSubscriptionUrl] = useState<string | null>(null);
  const [rcUnavailable, setRcUnavailable] = useState(false);

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await client.billing.me();
      if (res.data) {
        setBilling(res.data);
        setError(null);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!isAuthed) {
      setBilling(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void fetchOnce();
    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (cancelled) return;
        void fetchOnce();
      }, POLL_MS);
    };
    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        void fetchOnce();
        startTimer();
      } else {
        stopTimer();
      }
    };

    if (AppState.currentState === "active") startTimer();
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      stopTimer();
      sub.remove();
    };
  }, [fetchOnce, isAuthed]);

  // RC SDK lifecycle. We only configure when there's a signed-in user
  // (RC's appUserId must match Better Auth's user.id end-to-end so the
  // webhook's app_user_id can resolve back to our subscription row).
  useEffect(() => {
    if (!userId) {
      setOfferings(null);
      setManageSubscriptionUrl(null);
      setRcUnavailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await initRevenueCat(userId);
      if (cancelled) return;
      if ("handle" in result) {
        setOfferings(result.handle.offerings);
        setManageSubscriptionUrl(result.handle.customerInfo.managementURL);
        setRcUnavailable(false);
      } else {
        setOfferings(null);
        setManageSubscriptionUrl(null);
        setRcUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const purchasePlan = useCallback(
    async (plan: BillingPlan): Promise<PurchaseOutcome> => {
      if (!offerings) {
        return { status: "unavailable", reason: "not_configured" };
      }
      const pkg = findPackageForPlan(offerings, plan);
      if (!pkg) {
        return { status: "unavailable", reason: "no_package" };
      }
      try {
        await Purchases.purchasePackage(pkg);
      } catch (err) {
        if (isUserCancelledError(err)) return { status: "cancelled" };
        return { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
      try {
        await client.billing.sync();
      } catch (err) {
        console.warn("[billing] post-purchase sync failed; webhook will reconcile", err);
      }
      try {
        const fresh = await Purchases.getCustomerInfo();
        setManageSubscriptionUrl(fresh.managementURL);
      } catch {
        // non-fatal — keep the existing URL
      }
      await fetchOnce();
      return { status: "success" };
    },
    [client, fetchOnce, offerings],
  );

  const value = useMemo<BillingContextValue>(
    () => ({
      billing,
      error,
      loading,
      refresh: fetchOnce,
      purchasePlan,
      manageSubscriptionUrl,
      rcReady: offerings !== null,
      rcUnavailable,
    }),
    [
      billing,
      error,
      loading,
      fetchOnce,
      purchasePlan,
      manageSubscriptionUrl,
      offerings,
      rcUnavailable,
    ],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used inside <BillingProvider>");
  }
  return ctx;
}
