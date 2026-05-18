import { useCallback, useState } from "react";
import { authClient } from "../../auth/auth.client";
import { useSdk } from "../../../sdk/sdk.provider";

type DeleteAccountState = {
  open: boolean;
  pending: boolean;
  error: string | null;
  start: () => void;
  cancel: () => void;
  confirm: () => Promise<void>;
};

// Wires the destructive confirm dialog to the SDK + Better Auth signOut.
// The workflow handles binder/DO/R2/auth cleanup asynchronously on the
// server; the client's job is only to initiate + confirm and stop showing
// authenticated UI.
export function useDeleteAccount(): DeleteAccountState {
  const { client } = useSdk();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);

  const cancel = useCallback(() => {
    if (pending) return;
    setOpen(false);
    setError(null);
  }, [pending]);

  const confirm = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await client.account.delete();
      if (res.error) {
        setError("Something went wrong. Please try again in a moment.");
        return;
      }
      await authClient.signOut();
      setOpen(false);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setPending(false);
    }
  }, [client, pending]);

  return { open, pending, error, start, cancel, confirm };
}
