import { Link } from "react-router-dom";
import type { BillingStatus, BillingUpgradeOption } from "@baindar/sdk";
import { Button, Icons } from "@baindar/ui";
import { getPlanDetails } from "../planData";
import { formatPeriodReset, formatPlanLabel } from "../utils/format";
import { UsageBar } from "./UsageBar";

export type BillingLimitKind = "chat" | "summary" | "documents";

type LimitCopy = {
  label: string;
  title: string;
  body: string;
  metricLabel: string;
  Icon: typeof Icons.Sparkles;
};

const copyForKind = (kind: BillingLimitKind, billing: BillingStatus, limit: number): LimitCopy => {
  const plan = formatPlanLabel(billing.plan);
  const reset = formatPeriodReset(billing.periodResetAt);
  if (kind === "summary") {
    return {
      label: "Summary limit reached",
      title: "You've used every AI summary this month.",
      body: `${plan} includes ${limit.toLocaleString()} summaries this period. Your counter ${reset}, or you can upgrade now to keep going.`,
      metricLabel: "AI summaries",
      Icon: Icons.Quote,
    };
  }
  if (kind === "documents") {
    return {
      label: "Binder full",
      title: `Your binder is full at ${limit.toLocaleString()} documents.`,
      body: "Upgrading lifts the document cap and keeps everything you've already added in place.",
      metricLabel: "Documents in binder",
      Icon: Icons.BookOpen,
    };
  }
  return {
    label: "Chat limit reached",
    title: "You've used every conversation this month.",
    body: `${plan} includes ${limit.toLocaleString()} chat conversations this period. Your counter ${reset}, or you can upgrade now to keep reading.`,
    metricLabel: "Chat conversations",
    Icon: Icons.Sparkles,
  };
};

export function BillingLimitDialog({
  billing,
  kind,
  open,
  onClose,
  used,
  limit,
}: {
  billing: BillingStatus | null;
  kind: BillingLimitKind;
  open: boolean;
  onClose: () => void;
  used?: number;
  limit?: number;
}) {
  if (!open || !billing) return null;

  const resolvedLimit = limit ?? limitForKind(kind, billing);
  const resolvedUsed = used ?? usedForKind(kind, billing, resolvedLimit);
  const meta = copyForKind(kind, billing, resolvedLimit);
  const Icon = meta.Icon;
  const upgradeOptions = billing.upgradeOptions.slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper-900/45 px-4 py-6 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-limit-title"
        className="flex w-full max-w-[520px] flex-col gap-5 rounded-2xl bg-bd-bg p-6 text-bd-fg shadow-[0_32px_64px_rgba(20,15,10,0.30)]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bd-accent text-bd-accent-fg">
            <Icon size={18} color="currentColor" />
          </div>
          <div className="t-label-s text-bd-fg-muted">{meta.label}</div>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border-0 bg-bd-surface-raised text-bd-fg-subtle hover:bg-bd-surface-hover"
          >
            <Icons.Close size={14} color="currentColor" />
          </button>
        </div>

        <div>
          <h2
            id="billing-limit-title"
            className="m-0 font-display text-[28px] font-normal leading-[1.15] tracking-normal"
          >
            {meta.title}
          </h2>
          <p className="t-body-m m-0 mt-2 leading-[1.5] text-bd-fg-subtle">{meta.body}</p>
        </div>

        <div className="rounded-lg bg-bd-surface-raised p-3.5">
          <UsageBar label={meta.metricLabel} used={resolvedUsed} limit={resolvedLimit} />
        </div>

        {upgradeOptions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {upgradeOptions.map((option) => (
              <UpgradeTile key={option.plan} option={option} kind={kind} />
            ))}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" onClick={onClose} className="text-bd-fg-subtle">
            Maybe later
          </Button>
          <Link to="/plans" className="bd-btn bd-btn-pill bd-btn-wine bd-btn-md">
            See all plans
          </Link>
        </div>
      </section>
    </div>
  );
}

function UpgradeTile({ option, kind }: { option: BillingUpgradeOption; kind: BillingLimitKind }) {
  const plan = getPlanDetails(option.plan);
  const key =
    kind === "chat"
      ? "Chat conversations / month"
      : kind === "summary"
        ? "AI summaries / month"
        : "Documents in your binder";
  const feature = plan.features.find((item) => item.label === key) ?? plan.features[0];

  return (
    <a
      href={option.checkoutUrl}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col gap-1.5 rounded-lg border border-bd-border bg-bd-bg p-3.5 text-left text-bd-fg no-underline transition-colors hover:bg-bd-surface-hover"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[18px] font-medium leading-none">{plan.name}</span>
        <span className="font-mono text-[12px] text-bd-fg-muted">
          ${plan.price}
          {plan.cadence}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-medium leading-none">{feature.value}</span>
        <span className="t-body-s text-[11px] text-bd-fg-muted">{feature.label.toLowerCase()}</span>
      </div>
    </a>
  );
}

const limitForKind = (kind: BillingLimitKind, billing: BillingStatus): number => {
  if (kind === "summary") return billing.quota.summariesLimit;
  if (kind === "documents") return billing.quota.documentsLimit;
  return billing.quota.chatTurnsLimit;
};

const usedForKind = (kind: BillingLimitKind, billing: BillingStatus, limit: number): number => {
  if (kind === "summary") return billing.currentPeriod.summaries;
  if (kind === "documents") return limit;
  return billing.currentPeriod.chatTurns;
};
