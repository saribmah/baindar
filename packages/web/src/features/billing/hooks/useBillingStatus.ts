import { useBilling } from "../BillingProvider";

// Thin reader over the BillingProvider context. Kept as a hook so existing
// call sites (sidebar UsageMeter, SettingsPage BillingSection) don't have to
// learn about the context type. `refresh` is exposed so the chat pane can
// nudge billing state after each turn (the only event that mutates usage
// counters outside the purchase flow).
export function useBillingStatus() {
  const { billing, error, loading, refresh } = useBilling();
  return { billing, error, loading, refresh };
}
