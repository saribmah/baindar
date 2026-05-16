import type { BillingStatus } from "@baindar/sdk";
import { Progress } from "@baindar/ui";
import { formatPlanLabel, formatPeriodReset, isUnlimited } from "../utils/format";

// Compact meter for the sidebar profile area. Shows the dominant cost driver
// (chat turns) since one bar is all that fits next to the avatar. Hides
// entirely for unlimited plans (BYOK) where a progress bar is meaningless.
export function UsageMeter({ billing }: { billing: BillingStatus }) {
  const used = billing.currentPeriod.chatTurns;
  const limit = billing.quota.chatTurnsLimit;
  if (isUnlimited(limit)) {
    return (
      <div className="mb-2 px-3 py-2">
        <div className="t-label-s text-bd-fg-muted">
          {formatPlanLabel(billing.plan)} · unlimited
        </div>
      </div>
    );
  }
  const remaining = Math.max(0, limit - used);
  const exhausted = used >= limit;
  return (
    <div className="mb-2 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="t-label-s text-bd-fg-muted">{formatPlanLabel(billing.plan)} plan</span>
        <span className="t-label-s text-bd-fg-subtle">
          {remaining.toLocaleString()} chat{remaining === 1 ? "" : "s"} left
        </span>
      </div>
      <Progress value={used} max={limit} size="thin" tone={exhausted ? "wine" : "ink"} />
      <div className="t-body-s mt-1 text-bd-fg-muted">
        {formatPeriodReset(billing.periodResetAt)}
      </div>
    </div>
  );
}
