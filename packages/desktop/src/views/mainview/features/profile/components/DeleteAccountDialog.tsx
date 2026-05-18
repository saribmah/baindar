import { useEffect, useState } from "react";
import { Button, Input, Sheet } from "@baindar/ui";
import type { BillingStatus } from "@baindar/sdk";

const CONFIRM_PHRASE = "delete my account";

export function DeleteAccountDialog({
  pending,
  error,
  billing,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  error: string | null;
  billing: BillingStatus | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasActiveSubscription = billing != null && billing.plan !== "free";
  const [typed, setTyped] = useState("");
  const canConfirm = typed.trim().toLowerCase() === CONFIRM_PHRASE && !pending;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, pending]);

  return (
    <div
      role="dialog"
      aria-label="Delete account"
      className="fixed inset-0 z-30 flex items-end justify-center px-3 sm:items-center"
      style={{ background: "rgba(20, 15, 10, 0.42)", backdropFilter: "blur(6px)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
        <Sheet className="flex flex-col gap-5 p-6 sm:p-8" showHandle={false}>
          <div className="flex flex-col gap-2">
            <div className="t-label-s text-bd-fg-muted">Danger zone</div>
            <h2 className="t-display-s text-bd-fg">Delete your account?</h2>
            <p className="t-body-m text-bd-fg-subtle">
              This permanently removes your account and every document, highlight, note, and
              conversation in your binder. You will be signed out immediately. This cannot be
              undone.
            </p>
          </div>

          {hasActiveSubscription && (
            <div className="rounded-[14px] border border-bd-border bg-bd-surface-raised px-4 py-3">
              <div className="t-label-s mb-1 text-bd-fg">Subscription not cancelled</div>
              <p className="t-body-s text-bd-fg-subtle">
                Your subscription is billed through the App Store or Google Play and will not be
                cancelled by deleting your account. Open your platform's subscription settings to
                cancel it separately.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="t-label-s text-bd-fg-muted" htmlFor="delete-account-confirm">
              Type <span className="font-mono text-bd-fg">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <Input
              id="delete-account-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoFocus
              disabled={pending}
            />
          </div>

          {error && <div className="t-body-s text-bd-accent">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button variant="wine" onClick={onConfirm} disabled={!canConfirm}>
              {pending ? "Deleting..." : "Delete my account"}
            </Button>
          </div>
        </Sheet>
      </div>
    </div>
  );
}
