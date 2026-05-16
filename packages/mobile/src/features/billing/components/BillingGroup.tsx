import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { BillingStatus } from "@baindar/sdk";
import { Icons, useThemeColors, useThemedStyles } from "@baindar/ui";
import { buildBillingStyles } from "../billing.styles";
import { formatPeriodReset, formatPlanLabel, isUnlimited } from "../utils/format";

export function BillingGroup({ billing }: { billing: BillingStatus }) {
  const router = useRouter();
  const styles = useThemedStyles(buildBillingStyles);
  const palette = useThemeColors();
  const chatRemaining = remainingLabel(
    billing.currentPeriod.chatTurns,
    billing.quota.chatTurnsLimit,
  );

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>Plan & usage</Text>
      <View style={styles.groupBody}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/plan")}
          style={[styles.row, styles.rowLast]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Your plan</Text>
            <Text style={styles.rowSub}>
              {chatRemaining} · {formatPeriodReset(billing.periodResetAt)}
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{formatPlanLabel(billing.plan)}</Text>
          </View>
          <Icons.Chevron size={14} color={palette.fgMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const remainingLabel = (used: number, limit: number): string => {
  if (isUnlimited(limit)) return "Unlimited chats";
  const remaining = Math.max(0, limit - used);
  return `${remaining.toLocaleString()} chat${remaining === 1 ? "" : "s"} left`;
};
