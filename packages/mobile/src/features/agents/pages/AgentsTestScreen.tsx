import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "@baindar/ui";
import { useCounterAgent } from "../hooks/useCounterAgent.ts";

export function AgentsTestScreen() {
  const palette = useThemeColors();
  const insets = useSafeAreaInsets();
  const { count, connected, call } = useCounterAgent("mobile-smoke");

  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top + 24 }]}>
      <View style={[styles.card, { borderColor: palette.border }]}>
        <Text style={[styles.title, { color: palette.fg }]}>CounterAgent smoke test</Text>
        <Text style={[styles.subtitle, { color: palette.fgMuted }]}>
          instance: mobile-smoke ·{" "}
          <Text style={{ color: connected ? "#10b981" : "#f59e0b" }}>
            {connected ? "connected" : "connecting…"}
          </Text>
        </Text>
        <Text style={[styles.count, { color: palette.fg }]}>{count}</Text>
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, { borderColor: palette.border }]}
            onPress={() => call("decrement")}
          >
            <Text style={[styles.btnLabel, { color: palette.fg }]}>−</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { borderColor: palette.border }]}
            onPress={() => call("reset")}
          >
            <Text style={[styles.btnLabel, { color: palette.fg }]}>reset</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { borderColor: palette.border }]}
            onPress={() => call("increment")}
          >
            <Text style={[styles.btnLabel, { color: palette.fg }]}>+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
  },
  count: {
    fontSize: 56,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: "center",
  },
  btnLabel: {
    fontSize: 16,
  },
});
