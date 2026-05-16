import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ProviderSpec, type ProviderSetInput } from "@baindar/sdk";
import { font, radius, useThemeColors, type ThemeColors } from "@baindar/ui";
import type { ProviderState } from "../hooks/useProviderSettings";

// Per-spec defaults used to prefill the form when the user picks a spec
// and to suggest what the model id might look like. We never enforce a
// model — users on OpenRouter / self-hosted will paste whatever string
// their endpoint accepts.
const SPEC_PRESETS: Record<
  ProviderSpec,
  { baseUrl: string; modelPlaceholder: string; label: string; hint: string }
> = {
  [ProviderSpec.Anthropic]: {
    baseUrl: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-sonnet-4-5",
    label: "Anthropic",
    hint: "Direct Anthropic API. Best for claude-* models.",
  },
  [ProviderSpec.Openai]: {
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
    label: "OpenAI-compatible",
    hint: "OpenAI, OpenRouter, LiteLLM, Together, or any endpoint that speaks the OpenAI wire protocol.",
  },
};

export function ProviderSheet({
  state,
  visible,
  onClose,
}: {
  state: ProviderState;
  visible: boolean;
  onClose: () => void;
}) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);

  const existing = state.status?.settings ?? null;
  const initialSpec: ProviderSpec = existing?.spec ?? ProviderSpec.Anthropic;

  const [spec, setSpec] = useState<ProviderSpec>(initialSpec);
  const [baseUrl, setBaseUrl] = useState<string>(
    existing?.baseUrl ?? SPEC_PRESETS[initialSpec].baseUrl,
  );
  const [model, setModel] = useState<string>(existing?.model ?? "");
  const [apiKey, setApiKey] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  // Reset the form whenever the sheet re-opens so old values from a prior
  // session don't leak into a fresh edit.
  useEffect(() => {
    if (!visible) return;
    const next = state.status?.settings ?? null;
    const nextSpec: ProviderSpec = next?.spec ?? ProviderSpec.Anthropic;
    setSpec(nextSpec);
    setBaseUrl(next?.baseUrl ?? SPEC_PRESETS[nextSpec].baseUrl);
    setModel(next?.model ?? "");
    setApiKey("");
    setSubmitError(null);
  }, [visible, state.status]);

  const onSpecChange = (next: ProviderSpec) => {
    setSpec(next);
    const previousDefault = SPEC_PRESETS[spec].baseUrl;
    if (baseUrl === previousDefault || baseUrl === "") {
      setBaseUrl(SPEC_PRESETS[next].baseUrl);
    }
  };

  const trimmedKey = apiKey.trim();
  const trimmedModel = model.trim();
  const trimmedBaseUrl = baseUrl.trim();
  const canSave =
    !state.saving && trimmedKey.length >= 8 && trimmedModel.length > 0 && isHttpUrl(trimmedBaseUrl);

  const onSubmit = async () => {
    if (!canSave) return;
    setSubmitError(null);
    const input: ProviderSetInput = {
      spec,
      baseUrl: trimmedBaseUrl,
      model: trimmedModel,
      apiKey: trimmedKey,
    };
    const result = await state.save(input);
    if (result.ok) {
      onClose();
    } else {
      setSubmitError(result.error);
    }
  };

  const onRemove = async () => {
    setRemoving(true);
    try {
      await state.remove();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (!state.saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          style={styles.backdropTap}
          onPress={() => {
            if (!state.saving) onClose();
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.eyebrow}>BYOK · AI PROVIDER</Text>
            <Text style={styles.title}>
              {existing ? "Edit your provider" : "Connect your AI provider"}
            </Text>
            <Text style={styles.body}>
              Baindar will use this key for all your chat turns. The key is encrypted at rest and
              never returned — we only show its last 4 characters back to you.
            </Text>

            <Field label="Specification" hint={SPEC_PRESETS[spec].hint}>
              <View style={styles.chipRow}>
                {[ProviderSpec.Anthropic, ProviderSpec.Openai].map((option) => {
                  const active = option === spec;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      onPress={() => onSpecChange(option)}
                      style={[
                        styles.chip,
                        active
                          ? { backgroundColor: palette.accent, borderColor: palette.accent }
                          : { backgroundColor: "transparent", borderColor: palette.borderStrong },
                      ]}
                    >
                      <Text
                        style={[styles.chipText, { color: active ? palette.accentFg : palette.fg }]}
                      >
                        {SPEC_PRESETS[option].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            <Field label="Base URL">
              <TextInput
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={SPEC_PRESETS[spec].baseUrl}
                placeholderTextColor={palette.fgMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
            </Field>

            <Field label="Model" hint="Paste the exact model id your endpoint accepts.">
              <TextInput
                value={model}
                onChangeText={setModel}
                placeholder={SPEC_PRESETS[spec].modelPlaceholder}
                placeholderTextColor={palette.fgMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </Field>

            <Field
              label="API key"
              hint={
                existing
                  ? `Current key ends in ···· ${existing.keyLastFour}. Paste a new key to replace it.`
                  : "We validate the key with a 1-token test call before saving."
              }
            >
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={
                  existing ? `Leave blank to keep ···· ${existing.keyLastFour}` : "sk-..."
                }
                placeholderTextColor={palette.fgMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.input}
              />
            </Field>

            {submitError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorLabel}>Could not validate</Text>
                <Text style={styles.errorBody}>{submitError}</Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={!canSave}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: canSave ? palette.accent : palette.borderStrong,
                  opacity: pressed && canSave ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: canSave ? palette.accentFg : palette.fgMuted },
                ]}
              >
                {state.saving ? "Validating…" : existing ? "Save changes" : "Connect"}
              </Text>
            </Pressable>

            <View style={styles.secondaryRow}>
              {existing ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={removing || state.saving}
                  onPress={onRemove}
                  style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text style={[styles.linkText, { color: palette.fgSubtle }]}>
                    {removing ? "Removing…" : "Remove key"}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable
                accessibilityRole="button"
                disabled={state.saving}
                onPress={onClose}
                style={({ pressed }) => [styles.linkButton, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.linkText, { color: palette.fgSubtle }]}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const palette = useThemeColors();
  const styles = buildStyles(palette);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const isHttpUrl = (value: string): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
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
      maxHeight: "92%",
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
      gap: 16,
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
      fontSize: 24,
      fontWeight: "400",
      lineHeight: 28,
      color: palette.fg,
    },
    body: {
      marginTop: -6,
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 19,
      color: palette.fgSubtle,
    },
    field: {
      gap: 6,
    },
    fieldLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      fontWeight: "600",
      color: palette.fg,
    },
    fieldHint: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      lineHeight: 16,
      color: palette.fgMuted,
    },
    chipRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 2,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    chipText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "600",
    },
    input: {
      height: 44,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surfaceRaised,
      color: palette.fg,
      fontFamily: font.nativeFamily.ui,
      fontSize: 14,
    },
    errorBox: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: "#d58d2566",
      backgroundColor: "#d58d251a",
      padding: 12,
      gap: 4,
    },
    errorLabel: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.4,
      color: "#d58d25",
    },
    errorBody: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      lineHeight: 18,
      color: palette.fg,
    },
    primaryButton: {
      marginTop: 4,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
    },
    primaryButtonText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 15,
      fontWeight: "600",
    },
    secondaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 2,
    },
    linkButton: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    linkText: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 13,
      fontWeight: "600",
    },
  });
