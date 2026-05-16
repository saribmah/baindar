import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { font, radius, useThemeColors, type ThemeColors } from "@baindar/ui";
import { formatPlanLabel } from "../utils/format";
import { useBillingStatus } from "../hooks/useBillingStatus";

export function PlanBadge() {
  const router = useRouter();
  const palette = useThemeColors();
  const { billing } = useBillingStatus();
  if (!billing) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your plan"
      onPress={() => router.push("/plan")}
      style={({ pressed }) => [
        styles.badge,
        {
          borderColor: palette.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: palette.fgMuted }]}>
        {formatPlanLabel(billing.plan)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 28,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "500",
  },
});
