import { StyleSheet } from "react-native";
import { color, font, radius, type ThemeColors } from "@baindar/ui";

export const buildAuthStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: 24,
    },
    back: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
    },
    intro: {
      marginTop: 24,
      gap: 28,
    },
    monogram: {
      width: 56,
      height: 56,
      borderRadius: 16,
    },
    monogramText: {
      fontSize: 32,
      lineHeight: 32,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 38,
      fontWeight: "400",
      lineHeight: 39,
      letterSpacing: 0,
      color: palette.fg,
    },
    lead: {
      marginTop: 12,
      maxWidth: 300,
      fontFamily: font.nativeFamily.ui,
      fontSize: 15,
      lineHeight: 22,
      color: palette.fgSubtle,
    },
    form: {
      marginTop: 32,
      gap: 14,
    },
    socialButton: {
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      borderRadius: radius.pill,
    },
    socialButtonGoogle: {
      backgroundColor: palette.bg,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    socialButtonApple: {
      backgroundColor: palette.action,
    },
    pressed: {
      transform: [{ scale: 0.98 }],
    },
    socialLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 16,
      fontWeight: "500",
      color: palette.fg,
    },
    socialLabelApple: {
      color: palette.actionFg,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: palette.border,
    },
    dividerLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    label: {
      marginBottom: 8,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
      color: palette.fgSubtle,
    },
    inputWrap: {
      width: "100%",
    },
    input: {
      backgroundColor: palette.bg,
      borderColor: palette.borderStrong,
    },
    footer: {
      marginTop: "auto",
      alignItems: "center",
      paddingTop: 32,
    },
    switchText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 18,
      color: palette.fgMuted,
    },
    switchLink: {
      color: palette.fg,
      fontWeight: "500",
      textDecorationLine: "underline",
    },
    legal: {
      marginTop: 12,
      maxWidth: 300,
      textAlign: "center",
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 18,
      color: palette.fgMuted,
    },
    legalLink: {
      color: palette.fg,
      fontWeight: "500",
      textDecorationLine: "underline",
    },
    error: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 18,
      color: color.status.error,
    },
    otpIntro: {
      marginTop: 32,
    },
    eyebrow: {
      marginBottom: 10,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    otpTitle: {
      fontFamily: font.nativeFamily.display,
      fontSize: 36,
      fontWeight: "400",
      lineHeight: 38,
      letterSpacing: 0,
      color: palette.fg,
    },
    otpLead: {
      marginTop: 14,
      maxWidth: 300,
      fontFamily: font.nativeFamily.ui,
      fontSize: 15,
      lineHeight: 22,
      color: palette.fgSubtle,
    },
    emailStrong: {
      color: palette.fg,
      fontWeight: "500",
    },
    otpRow: {
      position: "relative",
      marginTop: 36,
      flexDirection: "row",
      gap: 8,
    },
    otpInput: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
      opacity: 0,
    },
    otpBox: {
      flex: 1,
      aspectRatio: 0.85,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: "transparent",
    },
    otpBoxActive: {
      borderColor: palette.fg,
    },
    otpDigit: {
      fontFamily: font.nativeFamily.display,
      fontSize: 28,
      fontWeight: "500",
      lineHeight: 32,
      color: palette.fg,
    },
    otpCaret: {
      width: 1,
      height: 24,
      backgroundColor: palette.fg,
    },
    otpActions: {
      marginTop: 24,
      gap: 12,
    },
    tip: {
      marginTop: "auto",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    tipText: {
      flex: 1,
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 18,
      color: palette.fgSubtle,
    },
  });

export type AuthStyles = ReturnType<typeof buildAuthStyles>;
