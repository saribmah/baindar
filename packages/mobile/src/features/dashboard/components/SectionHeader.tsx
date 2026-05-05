import { Pressable, Text, View } from "react-native";
import { useThemeColors, useThemedStyles } from "@baindar/ui";
import { buildDashboardStyles } from "../dashboard.styles";

export function SectionHeader({
  title,
  meta,
  onMetaPress,
}: {
  title: string;
  meta: string;
  onMetaPress?: () => void;
}) {
  const styles = useThemedStyles(buildDashboardStyles);
  const palette = useThemeColors();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onMetaPress ? (
        <Pressable accessibilityRole="button" onPress={onMetaPress}>
          <Text style={[styles.sectionMeta, { color: palette.accent, fontWeight: "600" }]}>
            {meta}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.sectionMeta}>{meta}</Text>
      )}
    </View>
  );
}
