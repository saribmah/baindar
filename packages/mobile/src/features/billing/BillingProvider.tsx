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
import type { BillingStatus } from "@baindar/sdk";
import { authClient } from "../auth";
import { useSdk } from "../../sdk/sdk.provider";

// Refresh cadence while the app is foregrounded. The /billing/me endpoint is
// two small D1 reads; 12s is fast enough that the Settings meter feels live
// during an active session without being a chatty background poll.
const POLL_MS = 12_000;

type BillingContextValue = {
  billing: BillingStatus | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
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
export function BillingProvider({ children }: { children: ReactNode }) {
  const { client } = useSdk();
  const session = authClient.useSession();
  const isAuthed = !!session.data?.user;
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
