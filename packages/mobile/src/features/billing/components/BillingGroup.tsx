import type { ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { BillingStatus, BillingUpgradeOption } from "@baindar/sdk";
import { Progress, useThemeColors, useThemedStyles } from "@baindar/ui";
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
        last={!hasActions(billing)}
      >
        <Pill>{formatCostUsd(billing.currentPeriod.costUsdMicros)}</Pill>
      </Row>
      <BillingActions billing={billing} />
    </Group>
  );
}

const hasActions = (billing: BillingStatus): boolean =>
  (billing.upgradeOptions ?? []).length > 0 || billing.portalUrl !== null;

function BillingActions({ billing }: { billing: BillingStatus }) {
  const upgradeOptions = billing.upgradeOptions ?? [];
  const portalUrl = billing.portalUrl;
  if (!hasActions(billing)) return null;
  return (
    <Row label={portalUrl ? "Manage plan" : "Upgrade"} last>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {upgradeOptions.map((opt: BillingUpgradeOption) => (
          <LinkButton
            key={opt.plan}
            url={opt.checkoutUrl}
            label={`Upgrade to ${formatPlanLabel(opt.plan)}`}
            tone="primary"
          />
        ))}
        {portalUrl && <LinkButton url={portalUrl} label="Manage plan" tone="secondary" />}
      </View>
    </Row>
  );
}

function LinkButton({
  url,
  label,
  tone,
}: {
  url: string;
  label: string;
  tone: "primary" | "secondary";
}) {
  const palette = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void Linking.openURL(url)}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: tone === "primary" ? palette.action : palette.surfaceRaised,
        borderWidth: tone === "primary" ? 0 : 1,
        borderColor: palette.border,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          color: tone === "primary" ? palette.bg : palette.fg,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
