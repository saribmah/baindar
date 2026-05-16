import { Text, View } from "react-native";
import type { BillingStatus } from "@baindar/sdk";
import { Progress, useThemedStyles } from "@baindar/ui";
import { buildBillingStyles } from "../billing.styles";
import { formatPeriodReset, formatPlanLabel, isUnlimited } from "../utils/format";

// Compact meter for the top of the Settings screen. Shows the dominant cost
// driver (chat turns). Hides the bar entirely for unlimited plans (BYOK)
// where a progress bar is meaningless — just shows the plan label.
export function UsageMeter({ billing }: { billing: BillingStatus }) {
  const styles = useThemedStyles(buildBillingStyles);
  const used = billing.currentPeriod.chatTurns;
  const limit = billing.quota.chatTurnsLimit;

  if (isUnlimited(limit)) {
    return (
      <View style={styles.meterCard}>
        <Text style={styles.meterPlanLabel}>{formatPlanLabel(billing.plan)} · unlimited</Text>
      </View>
    );
  }

  const remaining = Math.max(0, limit - used);
  const exhausted = used >= limit;
  return (
    <View style={styles.meterCard}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterPlanLabel}>{formatPlanLabel(billing.plan)} plan</Text>
        <Text style={styles.meterRemainingLabel}>
          {remaining.toLocaleString()} chat{remaining === 1 ? "" : "s"} left
        </Text>
      </View>
      <Progress value={used} max={limit} size="thin" tone={exhausted ? "wine" : "ink"} />
      <Text style={styles.meterReset}>{formatPeriodReset(billing.periodResetAt)}</Text>
    </View>
  );
}
