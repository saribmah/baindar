import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BillingPlan, type BillingStatus } from "@baindar/sdk";
import {
  Button,
  Icons,
  font,
  radius,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from "@baindar/ui";
import { useLibraryDocuments } from "../../library/hooks/useLibraryDocuments";
import { getPlanDetails } from "../planData";
import { useBillingStatus } from "../hooks/useBillingStatus";
import {
  formatCostUsd,
  formatPeriodReset,
  formatPlanLabel,
  formatQuotaCeiling,
  formatTokens,
  isUnlimited,
} from "../utils/format";
import { UsageBar } from "../components/UsageBar";

export function PlanUsageScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  const { counts } = useLibraryDocuments();
  const { billing, loading } = useBillingStatus();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <View style={styles.topBar}>
        <Button
          variant="secondary"
          size="sm"
          onPress={() => router.back()}
          iconStart={<Icons.Back size={14} color={palette.fg} />}
        >
          Back
        </Button>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>PLAN & USAGE</Text>
        <Text style={styles.title}>Your plan</Text>
      </View>

      {billing ? (
        <PlanUsage billing={billing} documentsUsed={counts.all} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.bodyMuted}>
            {loading ? "Loading billing..." : "Billing is not available right now."}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function PlanUsage({ billing, documentsUsed }: { billing: BillingStatus; documentsUsed: number }) {
  const router = useRouter();
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  const plan = getPlanDetails(billing.plan);
  const paid = billing.plan !== BillingPlan.Free;

  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.planCard,
          {
            backgroundColor: paid ? palette.fg : palette.surfaceRaised,
          },
        ]}
      >
        <View style={styles.planLabelRow}>
          <View
            style={[
              styles.planIcon,
              { backgroundColor: paid ? palette.accent : palette.borderStrong },
            ]}
          >
            <Icons.Sparkles size={13} color={paid ? palette.accentFg : palette.fgSubtle} />
          </View>
          <Text style={[styles.eyebrow, { color: paid ? palette.bg : palette.fgMuted }]}>
            CURRENT PLAN
          </Text>
        </View>
        <Text style={[styles.planTitle, { color: paid ? palette.bg : palette.fg }]}>
          {paid
            ? `Baindar ${plan.name} · $${plan.price}${plan.cadence}`
            : "You're on Baindar Free."}
        </Text>
        <Text style={[styles.planBody, { color: paid ? palette.bg : palette.fgSubtle }]}>
          {plan.description}
        </Text>
        <View style={styles.actions}>
          {billing.portalUrl ? (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onPress={() => void Linking.openURL(billing.portalUrl ?? "")}
            >
              Manage in Polar
            </Button>
          ) : (
            <Button variant="wine" size="sm" fullWidth onPress={() => router.push("/plans")}>
              See plans
            </Button>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/plans")}
            style={({ pressed }) => [
              styles.comparePlansButton,
              {
                backgroundColor: paid ? "rgba(255,255,255,0.10)" : "transparent",
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text style={[styles.comparePlansText, { color: paid ? palette.bg : palette.fg }]}>
              Compare plans
            </Text>
          </Pressable>
        </View>
      </View>

      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>This month</Text>
          <Text style={styles.bodyMuted}>{formatPeriodReset(billing.periodResetAt)}</Text>
        </View>
        <View style={styles.usageList}>
          <UsageItem>
            <UsageBar
              label="Documents in binder"
              used={documentsUsed}
              limit={billing.quota.documentsLimit}
              hint={documentsHint(documentsUsed, billing.quota.documentsLimit)}
            />
          </UsageItem>
          <UsageItem>
            <UsageBar
              label="Chat conversations"
              used={billing.currentPeriod.chatTurns}
              limit={billing.quota.chatTurnsLimit}
              hint={usageHint(
                billing.currentPeriod.chatTurns,
                billing.quota.chatTurnsLimit,
                "conversation",
              )}
            />
          </UsageItem>
          <UsageItem last>
            <UsageBar
              label="AI summaries"
              used={billing.currentPeriod.summaries}
              limit={billing.quota.summariesLimit}
              hint={usageHint(
                billing.currentPeriod.summaries,
                billing.quota.summariesLimit,
                "summary",
              )}
            />
          </UsageItem>
        </View>
      </View>

      {billing.plan === BillingPlan.Free && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/plans")}
          style={styles.cta}
        >
          <Icons.Sparkles size={22} color="#fefcfa" />
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Read without thinking about the cap.</Text>
            <Text style={styles.ctaBody}>From $9/mo · cancel any time</Text>
          </View>
          <Icons.Chevron size={14} color="#fefcfa" />
        </Pressable>
      )}

      <View style={styles.card}>
        <Text style={styles.eyebrow}>AI COST THIS PERIOD</Text>
        <Text style={styles.cost}>{formatCostUsd(billing.currentPeriod.costUsdMicros)}</Text>
        <Text style={styles.bodyMuted}>
          {formatTokens(billing.currentPeriod.inputTokens)} in ·{" "}
          {formatTokens(billing.currentPeriod.outputTokens)} out
        </Text>
        <Text style={[styles.bodyMuted, { marginTop: 8 }]}>
          Usage window {formatShortDate(billing.currentPeriod.periodStart)} →{" "}
          {formatShortDate(billing.currentPeriod.periodEnd)}
        </Text>
      </View>
    </View>
  );
}

function UsageItem({ children, last }: { children: ReactNode; last?: boolean }) {
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  return (
    <View style={[styles.usageItem, { borderBottomColor: palette.border }, last && styles.last]}>
      {children}
    </View>
  );
}

const documentsHint = (used: number, limit: number): string => {
  if (isUnlimited(limit)) return "Lifetime storage, within fair-use limits.";
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return "Your binder is full on this plan.";
  return `${remaining.toLocaleString()} ${remaining === 1 ? "slot" : "slots"} left.`;
};

const usageHint = (used: number, limit: number, noun: string): string => {
  if (isUnlimited(limit)) return "Unlimited on this plan.";
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return `No ${noun}s left this period.`;
  return `${remaining.toLocaleString()} of ${formatQuotaCeiling(limit)} left.`;
};

const formatShortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const buildStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      paddingHorizontal: 22,
      gap: 18,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
    },
    header: {
      gap: 4,
    },
    eyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 32,
      fontWeight: "400",
      lineHeight: 34,
      color: palette.fg,
    },
    stack: {
      gap: 18,
    },
    planCard: {
      borderRadius: radius.xl,
      padding: 18,
      gap: 12,
    },
    planLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    planIcon: {
      width: 24,
      height: 24,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    planTitle: {
      fontFamily: font.nativeFamily.display,
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 25,
    },
    planBody: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 19,
    },
    actions: {
      gap: 8,
    },
    comparePlansButton: {
      minHeight: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    comparePlansText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "600",
    },
    sectionHeader: {
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionTitle: {
      fontFamily: font.nativeFamily.display,
      fontSize: 22,
      fontWeight: "500",
      color: palette.fg,
    },
    usageList: {
      borderRadius: radius.lg,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 14,
    },
    usageItem: {
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    last: {
      borderBottomWidth: 0,
    },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      borderRadius: radius.lg,
      backgroundColor: "#62141a",
      padding: 16,
    },
    ctaTitle: {
      fontFamily: font.nativeFamily.display,
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 19,
      color: "#fefcfa",
    },
    ctaBody: {
      marginTop: 2,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      color: "#efebe6",
    },
    card: {
      borderRadius: radius.lg,
      backgroundColor: palette.surfaceRaised,
      padding: 16,
    },
    cost: {
      marginTop: 6,
      fontFamily: font.nativeFamily.display,
      fontSize: 30,
      fontWeight: "400",
      color: palette.fg,
    },
    bodyMuted: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      lineHeight: 17,
      color: palette.fgMuted,
    },
  });
