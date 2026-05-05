import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider.native.tsx";
import { radius } from "../tokens/radius.ts";

const BACKDROP_LIGHT = "rgba(20,15,10,0.35)";
const BACKDROP_DARK = "rgba(0,0,0,0.6)";

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  showHandle?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Sheet({ visible, onClose, showHandle = true, children, style }: SheetProps) {
  const { theme, palette } = useTheme();
  const backdropColor = theme === "dark" ? BACKDROP_DARK : BACKDROP_LIGHT;
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: backdropColor }]} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: palette.surface }, style]}
            onPress={() => undefined}
          >
            {showHandle && (
              <View style={[styles.handle, { backgroundColor: palette.borderStrong }]} />
            )}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius["2xl"],
    borderTopRightRadius: radius["2xl"],
    padding: 18,
    paddingBottom: 32,
    gap: 10,
    shadowColor: "rgba(20,15,10,1)",
    shadowOpacity: 0.1,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: -8 },
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: "center",
    marginBottom: 4,
  },
});
