import { useEffect, type ReactNode } from "react";
import { Button, IconButton, Icons, Sheet } from "@baindar/ui";
import { BillingPlan, type BillingStatus } from "@baindar/sdk";

// Welcome modal that pops on the PlanUsagePage when the user lands back
// from a successful Polar checkout. Per-plan copy + a primary CTA that
// matches what the user is most likely to do next:
//
//   Personal / Pro → "Start a chat" (closes the dialog)
//   BYOK           → "Connect your provider" (closes + opens ProviderSheet
//                     via the `onConnectProvider` callback)
//
// Dismissing clears the `?checkout=...` query param so a refresh doesn't
// re-pop the dialog.
export function CheckoutWelcomeDialog({
  billing,
  onClose,
  onConnectProvider,
}: {
  billing: BillingStatus;
  onClose: () => void;
  onConnectProvider: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copy = copyFor(billing);

  return (
    <Modal label="Subscription active" onCancel={onClose}>
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wine-700 text-paper-50">
            <Icons.Sparkles size={20} color="currentColor" />
          </span>
          <div>
            <div className="t-label-s text-bd-fg-muted">SUBSCRIPTION ACTIVE</div>
            <div className="font-display text-[24px] leading-[1.1] tracking-normal text-bd-fg">
              {copy.heading}
            </div>
          </div>
        </div>
        <IconButton aria-label="Close" size="sm" onClick={onClose}>
          <Icons.Close size={14} />
        </IconButton>
      </div>

      <p className="t-body-m mt-4 px-1 text-bd-fg-subtle">{copy.body}</p>

      {copy.bullets.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 px-1 text-bd-fg">
          {copy.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2">
              <Icons.Check size={14} color="var(--bd-fg)" className="mt-1 shrink-0" />
              <span className="t-body-m">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Maybe later
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (copy.primary.kind === "connect-provider") {
              onConnectProvider();
            } else {
              onClose();
            }
          }}
        >
          {copy.primary.label}
        </Button>
      </div>
    </Modal>
  );
}

type PrimaryAction = { kind: "close"; label: string } | { kind: "connect-provider"; label: string };

type WelcomeCopy = {
  heading: string;
  body: string;
  bullets: string[];
  primary: PrimaryAction;
};

const copyFor = (billing: BillingStatus): WelcomeCopy => {
  switch (billing.plan) {
    case BillingPlan.Personal:
      return {
        heading: "Welcome to Baindar Personal.",
        body: "Your subscription is active. The new monthly counters reset on the 1st.",
        bullets: [
          `${billing.quota.documentsLimit} documents in your binder.`,
          `${billing.quota.chatTurnsLimit} chat turns and ${billing.quota.summariesLimit} AI summaries per month.`,
        ],
        primary: { kind: "close", label: "Got it" },
      };
    case BillingPlan.Pro:
      return {
        heading: "Welcome to Baindar Pro.",
        body: "Your subscription is active. The new monthly counters reset on the 1st.",
        bullets: [
          `${billing.quota.documentsLimit} documents in your binder.`,
          `${billing.quota.chatTurnsLimit.toLocaleString()} chat turns and ${billing.quota.summariesLimit.toLocaleString()} AI summaries per month.`,
        ],
        primary: { kind: "close", label: "Got it" },
      };
    case BillingPlan.Byok:
      return {
        heading: "You're on BYOK — one more step.",
        body: "BYOK runs every chat turn through your own API key. Connect a provider to unlock unlimited use.",
        bullets: [
          "Anthropic direct, OpenAI, OpenRouter, LiteLLM, or any OpenAI-compatible endpoint.",
          "Your key is encrypted at rest and only used in your chats.",
          "You pay the provider for model usage; we charge $5/mo for the app.",
        ],
        primary: { kind: "connect-provider", label: "Connect provider" },
      };
    case BillingPlan.Free:
    default:
      return {
        heading: "Subscription update received.",
        body: "Polar is syncing your subscription. This page refreshes billing status in the background.",
        bullets: [],
        primary: { kind: "close", label: "Got it" },
      };
  }
};

function Modal({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed inset-0 z-30 flex flex-col justify-center"
      style={{ background: "rgba(20, 15, 10, 0.45)" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div onClick={(event) => event.stopPropagation()} className="mx-auto w-full max-w-xl px-4">
        <Sheet showHandle={false}>
          <div className="p-6 sm:p-7">{children}</div>
        </Sheet>
      </div>
    </div>
  );
}
