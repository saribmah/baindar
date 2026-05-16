import { useCallback, useEffect, useState } from "react";
import type { ProviderSetInput, ProviderStatus } from "@baindar/sdk";
import { useSdk } from "../../../sdk";
import { useBilling } from "../BillingProvider";

// Hook for the BYOK provider settings panel. Wraps the three /provider/me
// SDK calls and exposes a single mutate/refresh surface. After any
// successful set/remove we also refresh the billing status so the
// "AI Provider · Configured" row on the plan page updates immediately
// without waiting for the 12s billing poll.
export type ProviderState = {
  status: ProviderStatus | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (input: ProviderSetInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  remove: () => Promise<void>;
};

export function useProviderSettings(): ProviderState {
  const { client } = useSdk();
  const { refresh: refreshBilling } = useBilling();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await client.provider.me();
      if (res.data) setStatus(res.data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: ProviderSetInput) => {
      setSaving(true);
      try {
        const res = await client.provider.set({ providerSetInput: input });
        if (res.error) {
          const message = errorMessageFrom(res.error);
          return { ok: false as const, error: message };
        }
        await refresh();
        await refreshBilling();
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, error: String(err) };
      } finally {
        setSaving(false);
      }
    },
    [client, refresh, refreshBilling],
  );

  const remove = useCallback(async () => {
    await client.provider.remove();
    await refresh();
    await refreshBilling();
  }, [client, refresh, refreshBilling]);

  return { status, loading, saving, error, refresh, save, remove };
}

// The SDK error shape for a 400 InvalidKey response is the NamedError
// envelope: `{ name, data: { reason, message } }`. Pull a usable string
// out so the form can render it under the api-key field.
const errorMessageFrom = (err: unknown): string => {
  if (err && typeof err === "object") {
    const data = (err as { data?: { reason?: string; message?: string } }).data;
    if (data?.message) return data.message;
    if (data?.reason) return data.reason;
  }
  return "Could not save provider settings. Please double-check the key and try again.";
};
