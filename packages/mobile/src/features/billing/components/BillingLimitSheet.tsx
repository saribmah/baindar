import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { BillingStatus, BillingUpgradeOption } from "@baindar/sdk";
import { Icons, font, radius, useThemeColors, type ThemeColors } from "@baindar/ui";
import { getPlanDetails } from "../planData";
import { formatPeriodReset, formatPlanLabel } from "../utils/format";
import { UsageBar } from "./UsageBar";

export type BillingLimitKind = "chat" | "summary" | "documents";

export function BillingLimitSheet({
  billing,
  kind,
  visible,
  onClose,
  used,
  limit,
}: {
  billing: BillingStatus | null;
  kind: BillingLimitKind;
  visible: boolean;
  onClose: () => void;
  used?: number;
  limit?: number;
}) {
  const router = useRouter();
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  if (!billing) return null;

  const resolvedLimit = limit ?? limitForKind(kind, billing);
  const resolvedUsed = used ?? usedForKind(kind, billing, resolvedLimit);
  const meta = copyForKind(kind, billing, resolvedLimit);
  const Icon = meta.Icon;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.labelRow}>
            <View style={styles.iconWrap}>
              <Icon size={16} color={palette.accentFg} />
            </View>
            <Text style={styles.eyebrow}>{meta.label}</Text>
          </View>
          <Text style={styles.title}>{meta.title}</Text>
          <Text style={styles.body}>{meta.body}</Text>

          <View style={styles.usageBox}>
            <UsageBar label={meta.metricLabel} used={resolvedUsed} limit={resolvedLimit} />
          </View>

          {billing.upgradeOptions.length > 0 && (
            <View style={styles.tiles}>
              {billing.upgradeOptions.slice(0, 2).map((option) => (
                <UpgradeTile key={option.plan} option={option} kind={kind} />
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push("/plans");
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>See all plans</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function UpgradeTile({ option, kind }: { option: BillingUpgradeOption; kind: BillingLimitKind }) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  const plan = getPlanDetails(option.plan);
  const key =
    kind === "chat"
      ? "Chat conversations / month"
      : kind === "summary"
        ? "AI summaries / month"
        : "Documents in your binder";
  const feature = plan.features.find((item) => item.label === key) ?? plan.features[0];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void Linking.openURL(option.checkoutUrl)}
      style={styles.tile}
    >
      <View style={styles.tileHeader}>
        <Text style={styles.tileName}>{plan.name}</Text>
        <Text style={styles.tilePrice}>
          ${plan.price}
          {plan.cadence}
        </Text>
      </View>
      <Text style={styles.tileValue}>{feature.value}</Text>
      <Text style={styles.tileMeta}>{feature.label.toLowerCase()}</Text>
    </Pressable>
  );
}

const copyForKind = (kind: BillingLimitKind, billing: BillingStatus, limit: number) => {
  const plan = formatPlanLabel(billing.plan);
  const reset = formatPeriodReset(billing.periodResetAt);
  if (kind === "summary") {
    return {
      label: "SUMMARY LIMIT REACHED",
      title: "You're out of summaries.",
      body: `${plan} includes ${limit.toLocaleString()} summaries. They ${reset}, or you can upgrade now.`,
      metricLabel: "AI summaries",
      Icon: Icons.Quote,
    };
  }
  if (kind === "documents") {
    return {
      label: "BINDER FULL",
      title: "Your binder is full.",
      body: "Upgrade or remove a document to add this one.",
      metricLabel: "Documents in binder",
      Icon: Icons.BookOpen,
    };
  }
  return {
    label: "CHAT LIMIT REACHED",
    title: "You're out of chats for the month.",
    body: `${plan} includes ${limit.toLocaleString()} conversations. They ${reset}, or you can upgrade now.`,
    metricLabel: "Chat conversations",
    Icon: Icons.Sparkles,
  };
};

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

const buildStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(20,15,10,0.45)",
    },
    backdropTap: {
      flex: 1,
    },
    sheet: {
      gap: 15,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: palette.bg,
      paddingHorizontal: 20,
      paddingBottom: 22,
      paddingTop: 8,
      shadowColor: palette.fg,
      shadowOffset: { width: 0, height: -16 },
      shadowOpacity: 0.18,
      shadowRadius: 40,
      elevation: 8,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 999,
      backgroundColor: palette.borderStrong,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.accent,
    },
    eyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 25,
      fontWeight: "400",
      lineHeight: 28,
      color: palette.fg,
    },
    body: {
      marginTop: -8,
      fontFamily: font.nativeFamily.ui,
      fontSize: 14,
      lineHeight: 20,
      color: palette.fgSubtle,
    },
    usageBox: {
      borderRadius: radius.md,
      backgroundColor: palette.surfaceRaised,
      padding: 12,
    },
    tiles: {
      flexDirection: "row",
      gap: 8,
    },
    tile: {
      flex: 1,
      borderRadius: radius.md,
      backgroundColor: palette.fg,
      padding: 11,
    },
    tileHeader: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 8,
    },
    tileName: {
      fontFamily: font.nativeFamily.display,
      fontSize: 15,
      fontWeight: "600",
      color: palette.bg,
    },
    tilePrice: {
      fontFamily: font.nativeFamily.mono,
      fontSize: 10,
      color: palette.bg,
    },
    tileValue: {
      marginTop: 5,
      fontFamily: font.nativeFamily.display,
      fontSize: 18,
      fontWeight: "500",
      color: palette.bg,
    },
    tileMeta: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 10,
      color: palette.bg,
    },
    primaryButton: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      backgroundColor: palette.accent,
    },
    primaryButtonText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 15,
      fontWeight: "600",
      color: palette.accentFg,
    },
    secondaryButton: {
      alignSelf: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    secondaryButtonText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "600",
      color: palette.fgSubtle,
    },
  });
