import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BillingPlan, type BillingStatus } from "@baindar/sdk";
import { Icons, font, radius, useThemeColors, type ThemeColors } from "@baindar/ui";

// Welcome sheet that pops on PlanUsageScreen when the user lands back from
// a successful Polar checkout. Per-plan copy + a primary CTA that matches
// what the user is most likely to do next:
//
//   Personal / Pro → "Got it" (closes the sheet)
//   BYOK           → "Connect provider" (closes + opens ProviderSheet via
//                     the `onConnectProvider` callback)
export function CheckoutWelcomeSheet({
  billing,
  visible,
  onClose,
  onConnectProvider,
}: {
  billing: BillingStatus | null;
  visible: boolean;
  onClose: () => void;
  onConnectProvider: () => void;
}) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  if (!billing) return null;

  const copy = copyFor(billing);
  const primaryConnect = copy.primary.kind === "connect-provider";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.headerRow}>
              <View style={styles.iconWrap}>
                <Icons.Sparkles size={18} color={palette.accentFg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>SUBSCRIPTION ACTIVE</Text>
                <Text style={styles.title}>{copy.heading}</Text>
              </View>
            </View>

            <Text style={styles.body}>{copy.body}</Text>

            {copy.bullets.length > 0 && (
              <View style={styles.bullets}>
                {copy.bullets.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Icons.Check size={14} color={palette.fg} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (primaryConnect) {
                  onConnectProvider();
                } else {
                  onClose();
                }
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: palette.accentFg }]}>
                {copy.primary.label}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.linkText, { color: palette.fgSubtle }]}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type PrimaryAction = { kind: "close"; label: string } | { kind: "connect-provider"; label: string };

type WelcomeCopy = {
  heading: string;
  body: string;
  bullets: string[];
  primary: PrimaryAction;
};

const copyFor = (billing: BillingStatus): WelcomeCopy => {
  switch (billing.plan) {
    case BillingPlan.Personal:
      return {
        heading: "Welcome to Baindar Personal.",
        body: "Your subscription is active. The new monthly counters reset on the 1st.",
        bullets: [
          `${billing.quota.documentsLimit} documents in your binder.`,
          `${billing.quota.chatTurnsLimit} chat turns and ${billing.quota.summariesLimit} AI summaries per month.`,
        ],
        primary: { kind: "close", label: "Got it" },
      };
    case BillingPlan.Pro:
      return {
        heading: "Welcome to Baindar Pro.",
        body: "Your subscription is active. The new monthly counters reset on the 1st.",
        bullets: [
          `${billing.quota.documentsLimit} documents in your binder.`,
          `${billing.quota.chatTurnsLimit.toLocaleString()} chat turns and ${billing.quota.summariesLimit.toLocaleString()} AI summaries per month.`,
        ],
        primary: { kind: "close", label: "Got it" },
      };
    case BillingPlan.Byok:
      return {
        heading: "You're on BYOK — one more step.",
        body: "BYOK runs every chat turn through your own API key. Connect a provider to unlock unlimited use.",
        bullets: [
          "Anthropic direct, OpenAI, OpenRouter, LiteLLM, or any OpenAI-compatible endpoint.",
          "Your key is encrypted at rest and only used in your chats.",
          "You pay the provider for model usage; we charge $5/mo for the app.",
        ],
        primary: { kind: "connect-provider", label: "Connect provider" },
      };
    case BillingPlan.Free:
    default:
      return {
        heading: "Subscription update received.",
        body: "Polar is syncing your subscription. This screen refreshes billing in the background.",
        bullets: [],
        primary: { kind: "close", label: "Got it" },
      };
  }
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
      maxHeight: "85%",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: palette.bg,
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
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 28,
      paddingTop: 14,
      gap: 14,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
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
      marginTop: 2,
      fontFamily: font.nativeFamily.display,
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 26,
      color: palette.fg,
    },
    body: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 14,
      lineHeight: 20,
      color: palette.fgSubtle,
    },
    bullets: {
      gap: 8,
      marginTop: 2,
    },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    bulletText: {
      flex: 1,
      fontFamily: font.nativeFamily.ui,
      fontSize: 14,
      lineHeight: 20,
      color: palette.fg,
    },
    primaryButton: {
      marginTop: 6,
      height: 46,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 15,
      fontWeight: "600",
    },
    linkButton: {
      alignSelf: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    linkText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "600",
    },
  });
