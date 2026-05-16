import { Link } from "react-router-dom";
import type { BillingStatus } from "@baindar/sdk";
import { Icons } from "@baindar/ui";
import { formatPeriodReset, formatPlanLabel, isUnlimited } from "../utils/format";

export function BillingSection({ billing }: { billing: BillingStatus }) {
  const chatRemaining = remainingLabel(
    billing.currentPeriod.chatTurns,
    billing.quota.chatTurnsLimit,
  );

  return (
    <section className="grid gap-4 border-b border-bd-border py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div className="t-label-s text-bd-fg-muted">Plan & usage</div>
      <Link
        to="/settings/plan"
        className="-m-3 flex items-center gap-4 rounded-xl border border-transparent p-3 text-bd-fg no-underline transition-colors hover:border-bd-border hover:bg-bd-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="t-label-l text-bd-fg">Your plan</div>
          <div className="t-body-s mt-0.5 text-bd-fg-muted">
            {chatRemaining} · {formatPeriodReset(billing.periodResetAt)}
          </div>
        </div>
        <span className="bd-chip bd-chip-outline shrink-0">{formatPlanLabel(billing.plan)}</span>
        <Icons.Chevron size={14} color="var(--bd-fg-muted)" />
      </Link>
    </section>
  );
}

const remainingLabel = (used: number, limit: number): string => {
  if (isUnlimited(limit)) return "Unlimited chats";
  const remaining = Math.max(0, limit - used);
  return `${remaining.toLocaleString()} chat${remaining === 1 ? "" : "s"} left`;
};
