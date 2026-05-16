import { StyleSheet } from "react-native";
import { font, radius, type ThemeColors } from "@baindar/ui";

export const buildBillingStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    meterCard: {
      marginBottom: 16,
      padding: 14,
      borderRadius: 14,
      backgroundColor: palette.surfaceRaised,
    },
    meterHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 8,
    },
    meterPlanLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
      color: palette.fgMuted,
      textTransform: "uppercase",
    },
    meterRemainingLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      color: palette.fgSubtle,
    },
    meterReset: {
      marginTop: 8,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      color: palette.fgMuted,
    },
    group: {
      marginBottom: 20,
    },
    groupLabel: {
      marginBottom: 8,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
      color: palette.fgMuted,
      textTransform: "uppercase",
    },
    groupBody: {
      borderRadius: 14,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 14,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingVertical: 14,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "500",
      color: palette.fg,
    },
    rowSub: {
      marginTop: 2,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      color: palette.fgMuted,
    },
    rowBar: {
      width: 80,
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.border,
    },
    pillText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      color: palette.fgSubtle,
    },
  });

export type BillingStyles = ReturnType<typeof buildBillingStyles>;
