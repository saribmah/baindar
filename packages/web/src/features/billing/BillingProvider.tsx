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
import { type BillingPlan, type BillingStatus } from "@baindar/sdk";
import type { Offerings } from "@revenuecat/purchases-js";
import { authClient } from "../auth";
import { useSdk } from "../../sdk";
import { findPackageForPlan, initRevenueCat, isUserCancelledError } from "./revenuecat";

// Refresh cadence while the tab is visible. The /billing/me endpoint is two
// small D1 reads; 12s is fast enough that the sidebar meter feels live during
// an active chat session without being a chatty background poll.
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
  // RC-specific surface area. `purchasePlan` opens the Web Billing checkout
  // sheet and, on success, syncs server-side billing state so the rest of
  // the UI reflects the new plan immediately. `manageSubscriptionUrl` comes
  // from the RC CustomerInfo (Stripe portal for Web Billing).
  purchasePlan: (plan: BillingPlan) => Promise<PurchaseOutcome>;
  manageSubscriptionUrl: string | null;
  // True when the RC SDK is configured AND we have offerings. Lets the UI
  // distinguish "loading" (show spinner) from "not configured" (show
  // unavailable copy) instead of perpetual loading state.
  rcReady: boolean;
  rcUnavailable: boolean;
};

const BillingContext = createContext<BillingContextValue | null>(null);

// Provider centralises the fetch so the sidebar UsageMeter and the
// SettingsPage BillingSection share one in-flight request and one cached
// value. Without this, each consumer fetched once on mount and never again —
// causing the meter to lag indefinitely during a chat session. The polling
// loop + visibility refetch keep the value within ~POLL_MS of reality.
//
// The RC SDK is configured the first time the provider mounts under a
// signed-in user; we keep the Purchases instance + Offerings in state so
// `purchasePlan` doesn't have to refetch them on every click.
export function BillingProvider({ children }: { children: ReactNode }) {
  const { client } = useSdk();
  const session = authClient.useSession();
  const userId = session.data?.user.id ?? null;

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

  const [offerings, setOfferings] = useState<Offerings | null>(null);
  const [manageSubscriptionUrl, setManageSubscriptionUrl] = useState<string | null>(null);
  const [rcUnavailable, setRcUnavailable] = useState(false);
  const purchasesRef = useRef<Awaited<ReturnType<typeof initRevenueCat>> | null>(null);

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

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchOnce();
        startTimer();
      } else {
        stopTimer();
      }
    };

    if (document.visibilityState === "visible") startTimer();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchOnce]);

  // RC SDK lifecycle. We only configure when there's a signed-in user
  // (RC's appUserId must match Better Auth's user.id end-to-end so the
  // webhook's app_user_id can resolve back to our subscription row).
  useEffect(() => {
    if (!userId) {
      setOfferings(null);
      setManageSubscriptionUrl(null);
      setRcUnavailable(false);
      purchasesRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await initRevenueCat(userId);
      if (cancelled) return;
      purchasesRef.current = result;
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
      const result = purchasesRef.current;
      if (!result || !("handle" in result)) {
        return { status: "unavailable", reason: "not_configured" };
      }
      const pkg = findPackageForPlan(result.handle.offerings, plan);
      if (!pkg) {
        return { status: "unavailable", reason: "no_package" };
      }
      try {
        await result.handle.purchases.purchase({ rcPackage: pkg });
      } catch (err) {
        if (isUserCancelledError(err)) return { status: "cancelled" };
        return { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
      // RC's webhook will eventually update the server, but we don't want
      // the UI to lag while the user is staring at the success state. Sync
      // immediately and refresh local billing state in parallel.
      try {
        await client.billing.sync();
      } catch (err) {
        console.warn("[billing] post-purchase sync failed; webhook will reconcile", err);
      }
      try {
        const fresh = await result.handle.purchases.getCustomerInfo();
        setManageSubscriptionUrl(fresh.managementURL);
      } catch {
        // non-fatal — keep the existing URL
      }
      await fetchOnce();
      return { status: "success" };
    },
    [client, fetchOnce],
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
