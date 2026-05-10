import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  Icons,
  font,
  radius,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from "@baindar/ui";

export type BottomTabKey = "home" | "library" | "ask" | "highlights" | "notes";

const ROUTE_BY_TAB: Record<BottomTabKey, string> = {
  home: "dashboard",
  library: "library",
  ask: "conversations",
  highlights: "highlights",
  notes: "notes",
};

const TABS: ReadonlyArray<{
  key: BottomTabKey;
  icon: (typeof Icons)[keyof typeof Icons];
  name: string;
  primary?: boolean;
}> = [
  { key: "home", icon: Icons.Home, name: "Home" },
  { key: "library", icon: Icons.Library, name: "Library" },
  { key: "ask", icon: Icons.Sparkles, name: "Ask", primary: true },
  { key: "highlights", icon: Icons.Highlight, name: "Highlights" },
  { key: "notes", icon: Icons.Note, name: "Notes" },
];

type Props = BottomTabBarProps;

export function BottomTabs({ state, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  const activeRouteName = state.routes[state.index]?.name;

  const handlePress = (tabKey: BottomTabKey) => {
    const targetName = ROUTE_BY_TAB[tabKey];
    const target = state.routes.find((r) => r.name === targetName);
    if (!target) return;
    const isFocused = activeRouteName === targetName;
    const event = navigation.emit({
      type: "tabPress",
      target: target.key,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(target.name);
    }
  };

  return (
    <View style={[styles.tabs, { paddingBottom: insets.bottom + 10 }]}>
      {TABS.map((tab) => {
        const selected = activeRouteName === ROUTE_BY_TAB[tab.key];
        if (tab.primary) {
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.name}
              onPress={() => handlePress(tab.key)}
              style={styles.tabItem}
            >
              <View style={styles.primaryTab}>
                <tab.icon size={20} color={palette.actionFg} />
              </View>
              <Text style={[styles.tabLabel, selected ? styles.tabLabelActive : null]}>
                {tab.name}
              </Text>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={tab.name}
            onPress={() => handlePress(tab.key)}
            style={styles.tabItem}
          >
            <tab.icon
              size={22}
              color={selected ? palette.fg : palette.fgMuted}
              strokeWidth={selected ? 2 : 1.5}
            />
            <Text style={[styles.tabLabel, selected ? styles.tabLabelActive : null]}>
              {tab.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const buildStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    tabs: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "row",
      justifyContent: "space-around",
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.bg,
      paddingTop: 12,
    },
    tabItem: {
      minWidth: 54,
      alignItems: "center",
      gap: 4,
    },
    primaryTab: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: palette.action,
    },
    tabLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 10,
      color: palette.fgMuted,
    },
    tabLabelActive: {
      color: palette.fg,
      fontWeight: "600",
    },
  });
