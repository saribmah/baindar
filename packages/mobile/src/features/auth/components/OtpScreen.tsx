import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Button, Icons, useThemeColors, useThemedStyles } from "@baindar/ui";
import { buildAuthStyles } from "../auth.styles";
import { BackButton } from "./BackButton";
import { OtpBoxes } from "./OtpBoxes";

export function OtpScreen({
  email,
  otp,
  busy,
  error,
  onBack,
  onOtpChange,
  onSubmit,
  paddingTop,
  paddingBottom,
}: {
  email: string;
  otp: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onOtpChange: (value: string) => void;
  onSubmit: () => void;
  paddingTop: number;
  paddingBottom: number;
}) {
  const styles = useThemedStyles(buildAuthStyles);
  const palette = useThemeColors();
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton onPress={onBack} />

        <View style={styles.otpIntro}>
          <Text style={styles.eyebrow}>STEP 02 / VERIFY</Text>
          <Text style={styles.otpTitle}>Check your{"\n"}inbox.</Text>
          <Text style={styles.otpLead}>
            We sent a 6-digit code to <Text style={styles.emailStrong}>{email}</Text>. It expires in
            10 minutes.
          </Text>
        </View>

        <OtpBoxes value={otp} onChange={onOtpChange} />

        <View style={styles.otpActions}>
          <Button size="lg" fullWidth disabled={busy || otp.length < 4} onPress={onSubmit}>
            {busy ? "Verifying..." : "Verify & continue"}
          </Button>
          <Button variant="ghost" size="md" fullWidth>
            Resend code 0:42
          </Button>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.tip}>
          <Icons.Sparkles size={16} color={palette.accent} />
          <Text style={styles.tipText}>Tip: paste codes directly - we'll auto-fill the boxes.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
