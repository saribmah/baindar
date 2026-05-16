import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProviderSpec, type BillingStatus } from "@baindar/sdk";
import { Icons, font, radius, useThemeColors, type ThemeColors } from "@baindar/ui";
import { useProviderSettings } from "../hooks/useProviderSettings";
import { ProviderSheet } from "./ProviderSheet";

// "AI Provider" row that appears on the PlanUsageScreen when the user is on
// the BYOK plan. Two states: not configured (loud CTA — they can't chat
// without it) and configured (last-4 + Edit). Hidden entirely for other
// plans; that check lives at the call site.
export function ProviderRow({
  billing,
  initiallyOpen = false,
}: {
  billing: BillingStatus;
  initiallyOpen?: boolean;
}) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  const state = useProviderSettings();
  const [sheetOpen, setSheetOpen] = useState(initiallyOpen);

  const configured = billing.providerConfigured;
  const settings = state.status?.settings ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Text style={styles.eyebrow}>AI PROVIDER</Text>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: configured ? "#287c4233" : "#d58d2533",
              borderColor: configured ? "#287c4288" : "#d58d2588",
            },
          ]}
        >
          <Text style={[styles.pillText, { color: configured ? "#287c42" : "#d58d25" }]}>
            {configured ? "Connected" : "Not connected"}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>
        {configured ? "Your key is powering chat." : "Connect your AI provider to start chatting."}
      </Text>

      <Text style={styles.body}>
        {configured
          ? "All your chat turns go straight to your provider with your key. We charge $5/mo for the app, search, and storage — never your model usage."
          : "BYOK requires a working API key. Add an Anthropic key or any OpenAI-compatible endpoint (OpenRouter, LiteLLM, self-hosted) and we'll route every turn through it."}
      </Text>

      {configured && settings && (
        <View style={styles.meta}>
          <MetaRow
            label="Spec"
            value={settings.spec === ProviderSpec.Anthropic ? "Anthropic" : "OpenAI-compatible"}
          />
          <MetaRow label="Model" value={settings.model} />
          <MetaRow label="Key" value={`···· ${settings.keyLastFour}`} />
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => setSheetOpen(true)}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: configured ? palette.surfaceRaised : palette.accent,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {configured && <Icons.Settings size={14} color={palette.fg} />}
        <Text style={[styles.ctaText, { color: configured ? palette.fg : palette.accentFg }]}>
          {configured ? "Edit provider" : "Connect provider"}
        </Text>
      </Pressable>

      <ProviderSheet state={state} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const buildStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.xl,
      backgroundColor: palette.surfaceRaised,
      padding: 18,
      gap: 12,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    eyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    pill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 26,
      color: palette.fg,
    },
    body: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 19,
      color: palette.fgSubtle,
    },
    meta: {
      gap: 6,
      paddingTop: 4,
    },
    metaRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "baseline",
    },
    metaLabel: {
      width: 56,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
      color: palette.fgMuted,
    },
    metaValue: {
      flex: 1,
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      color: palette.fg,
    },
    cta: {
      marginTop: 4,
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 999,
      paddingHorizontal: 16,
    },
    ctaText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 14,
      fontWeight: "600",
    },
  });
