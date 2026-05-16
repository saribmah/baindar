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
import type { BillingStatus } from "@baindar/sdk";
import { useSdk } from "../../sdk";

// Refresh cadence while the tab is visible. The /billing/me endpoint is two
// small D1 reads; 12s is fast enough that the sidebar meter feels live during
// an active chat session without being a chatty background poll.
const POLL_MS = 12_000;

type BillingContextValue = {
  billing: BillingStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BillingContext = createContext<BillingContextValue | null>(null);

// Provider centralises the fetch so the sidebar UsageMeter and the
// SettingsPage BillingSection share one in-flight request and one cached
// value. Without this, each consumer fetched once on mount and never again —
// causing the meter to lag indefinitely during a chat session. The polling
// loop + visibility refetch keep the value within ~POLL_MS of reality, which
// is good enough for Phase 2 (no hard caps yet); precision becomes the
// server's job once Phase 3 enforcement lands.
export function BillingProvider({ children }: { children: ReactNode }) {
  const { client } = useSdk();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlightRef = useRef(false);

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

  const value = useMemo<BillingContextValue>(
    () => ({ billing, error, loading, refresh: fetchOnce }),
    [billing, error, loading, fetchOnce],
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
