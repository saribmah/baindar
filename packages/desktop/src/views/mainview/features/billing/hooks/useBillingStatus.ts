import { useBilling } from "../BillingProvider";

// Thin reader over the BillingProvider context. Kept as a hook so existing
// call sites (sidebar UsageMeter, SettingsPage BillingSection) don't have to
// learn about the context type; they just see `{ billing, error, loading }`
// as before, except now the value stays fresh via the provider's polling.
export function useBillingStatus() {
  const { billing, error, loading } = useBilling();
  return { billing, error, loading };
}
