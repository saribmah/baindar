import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { BillingStatus } from "@baindar/sdk";
import { Progress, useThemedStyles } from "@baindar/ui";
import { buildBillingStyles } from "../billing.styles";
import {
  formatCostUsd,
  formatPeriodReset,
  formatPlanLabel,
  formatQuotaCeiling,
  formatTokens,
  isUnlimited,
} from "../utils/format";

// Full Billing group for the SettingsScreen — analog of the web/desktop
// BillingSection. Mirrors the local Group/Row shape used by SettingsScreen
// so it slots in alongside Reading / AI / Notifications / Account groups
// without exposing layout primitives.
export function BillingGroup({ billing }: { billing: BillingStatus }) {
  return (
    <Group label="Billing">
      <Row label="Plan" sub={`${formatPlanLabel(billing.plan)} · ${billing.status}`}>
        <Pill>{formatPlanLabel(billing.plan)}</Pill>
      </Row>
      <UsageRow
        label="Chat turns"
        used={billing.currentPeriod.chatTurns}
        limit={billing.quota.chatTurnsLimit}
        reset={billing.periodResetAt}
      />
      <UsageRow
        label="Summaries"
        used={billing.currentPeriod.summaries}
        limit={billing.quota.summariesLimit}
        reset={billing.periodResetAt}
      />
      <Row
        label="Tokens this period"
        sub={`${formatTokens(billing.currentPeriod.inputTokens)} in · ${formatTokens(billing.currentPeriod.outputTokens)} out`}
        last
      >
        <Pill>{formatCostUsd(billing.currentPeriod.costUsdMicros)}</Pill>
      </Row>
    </Group>
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
  const styles = useThemedStyles(buildBillingStyles);
  if (isUnlimited(limit)) {
    return (
      <Row label={label} sub={`${used.toLocaleString()} this period · unlimited`}>
        <Pill>∞</Pill>
      </Row>
    );
  }
  const remaining = Math.max(0, limit - used);
  return (
    <Row
      label={label}
      sub={`${used.toLocaleString()} of ${formatQuotaCeiling(limit)} · ${remaining.toLocaleString()} left · ${formatPeriodReset(reset)}`}
    >
      <View style={styles.rowBar}>
        <Progress value={used} max={limit} size="thin" tone={used >= limit ? "wine" : "ink"} />
      </View>
    </Row>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemedStyles(buildBillingStyles);
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  sub,
  children,
  last,
}: {
  label: string;
  sub?: string;
  children?: ReactNode;
  last?: boolean;
}) {
  const styles = useThemedStyles(buildBillingStyles);
  return (
    <View style={[styles.row, last ? styles.rowLast : null]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function Pill({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(buildBillingStyles);
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}
