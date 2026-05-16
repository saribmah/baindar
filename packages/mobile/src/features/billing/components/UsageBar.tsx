import { StyleSheet, Text, View } from "react-native";
import { font, useThemeColors } from "@baindar/ui";
import { isUnlimited } from "../utils/format";

export function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const palette = useThemeColors();
  const unlimited = isUnlimited(limit);
  const percent = unlimited ? 8 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  const exhausted = !unlimited && used >= limit;
  const warning = !exhausted && !unlimited && percent >= 80;
  const fill = exhausted ? "#c13234" : warning ? "#d58d25" : palette.action;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
        <Text
          style={[styles.value, { color: exhausted ? "#c13234" : palette.fgSubtle }]}
          numberOfLines={1}
        >
          {used.toLocaleString()}{" "}
          <Text style={{ color: palette.fgMuted }}>
            {unlimited ? "· unlimited" : `/ ${limit.toLocaleString()}`}
          </Text>
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: palette.border }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: fill }]} />
      </View>
      {hint && (
        <Text style={[styles.hint, { color: exhausted ? "#c13234" : palette.fgMuted }]}>
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  label: {
    flex: 1,
    fontFamily: font.nativeFamily.ui,
    fontSize: 12,
    fontWeight: "600",
  },
  value: {
    fontFamily: font.nativeFamily.mono,
    fontSize: 11,
  },
  track: {
    height: 4,
    overflow: "hidden",
    borderRadius: 999,
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  hint: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
  },
});
