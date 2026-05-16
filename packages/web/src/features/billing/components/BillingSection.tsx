import type { ReactNode } from "react";
import type { BillingStatus } from "@baindar/sdk";
import { Chip, Progress } from "@baindar/ui";
import {
  formatCostUsd,
  formatPeriodReset,
  formatPlanLabel,
  formatQuotaCeiling,
  formatTokens,
  isUnlimited,
} from "../utils/format";

// Full Billing section for the SettingsPage. Mirrors the local Section/Row
// shape used elsewhere in SettingsPage — keep these helpers private so the
// section file stays self-contained and SettingsPage can swap in this
// component without exposing layout primitives.
export function BillingSection({ billing }: { billing: BillingStatus }) {
  const chatUsed = billing.currentPeriod.chatTurns;
  const summariesUsed = billing.currentPeriod.summaries;
  const chatLimit = billing.quota.chatTurnsLimit;
  const summariesLimit = billing.quota.summariesLimit;

  return (
    <Section label="Billing">
      <Row label="Plan" sub={`${formatPlanLabel(billing.plan)} · ${billing.status}`}>
        <Chip variant="outline">{formatPlanLabel(billing.plan)}</Chip>
      </Row>
      <UsageRow
        label="Chat turns"
        used={chatUsed}
        limit={chatLimit}
        reset={billing.periodResetAt}
      />
      <UsageRow
        label="Summaries"
        used={summariesUsed}
        limit={summariesLimit}
        reset={billing.periodResetAt}
      />
      <Row
        label="Tokens this period"
        sub={`${formatTokens(billing.currentPeriod.inputTokens)} in · ${formatTokens(billing.currentPeriod.outputTokens)} out`}
      >
        <Chip variant="outline">{formatCostUsd(billing.currentPeriod.costUsdMicros)}</Chip>
      </Row>
    </Section>
  );
}

function UsageRow({
  label,
  used,
  limit,
  reset,
}: {
  label: string;
  used: number;
  limit: number;
  reset: string;
}) {
  if (isUnlimited(limit)) {
    return (
      <Row label={label} sub={`${used.toLocaleString()} this period · unlimited`}>
        <Chip variant="outline">∞</Chip>
      </Row>
    );
  }
  const remaining = Math.max(0, limit - used);
  return (
    <Row
      label={label}
      sub={`${used.toLocaleString()} of ${formatQuotaCeiling(limit)} · ${remaining.toLocaleString()} left · ${formatPeriodReset(reset)}`}
    >
      <div className="w-32">
        <Progress value={used} max={limit} size="thin" tone={used >= limit ? "wine" : "ink"} />
      </div>
    </Row>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-bd-border py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div className="t-label-s text-bd-fg-muted">{label}</div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="t-label-l text-bd-fg">{label}</div>
        {sub && <div className="t-body-s mt-0.5 text-bd-fg-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
