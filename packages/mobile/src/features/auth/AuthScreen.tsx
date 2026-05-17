import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input, Monogram, useThemeColors, useThemedStyles } from "@baindar/ui";
import { PRIVACY_URL, TERMS_URL } from "../../config.ts";
import { buildAuthStyles } from "./auth.styles";
import { authClient } from "./auth.client";
import { BackButton } from "./components/BackButton";
import { OtpScreen } from "./components/OtpScreen";
import { OrDivider } from "./components/OrDivider";
import { SocialButton } from "./components/SocialButton";

export type AuthMode = "signin" | "signup";

type Phase = "email" | "otp";

const signedInCallbackURL = "/dashboard";

const authCopy = {
  signin: {
    title: "Welcome back,\nreader.",
    lead: "We'll send a one-time code to your inbox. No passwords.",
    submit: "Send sign-in code",
    switchLead: "New to Baindar?",
    switchAction: "Create account",
    switchTo: "/signup",
  },
  signup: {
    title: "Begin a quieter\nway to read.",
    lead: "Create your shelf in seconds. Upload books, highlight passages, ask questions.",
    submit: "Send sign-up code",
    switchLead: "Already have an account?",
    switchAction: "Sign in",
    switchTo: "/signin",
  },
} as const;

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const session = authClient.useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(buildAuthStyles);
  const palette = useThemeColors();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [phase, setPhase] = useState<Phase>("email");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = authCopy[mode];

  if (session.data?.user) return <Redirect href="/dashboard" />;

  const goBack = () => {
    if (phase === "otp") {
      setPhase("email");
      setOtp("");
      setError(null);
      return;
    }
    router.replace("/");
  };

  const requestOtp = async () => {
    setBusy(true);
    setError(null);
    const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Failed to send code");
      return;
    }
    setPhase("otp");
  };

  const submitOtp = async () => {
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.emailOtp({ email, otp });
    setBusy(false);
    if (res.error) setError(res.error.message ?? "Invalid code");
  };

  if (phase === "otp") {
    return (
      <OtpScreen
        email={email}
        otp={otp}
        busy={busy}
        error={error}
        onBack={goBack}
        onOtpChange={setOtp}
        onSubmit={submitOtp}
        paddingTop={insets.top + 12}
        paddingBottom={insets.bottom + 28}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BackButton onPress={goBack} />

        <View style={styles.intro}>
          <Monogram
            size="md"
            backgroundColor={palette.action}
            color={palette.actionFg}
            style={styles.monogram}
            textStyle={styles.monogramText}
          />
          <View>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.lead}>{copy.lead}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <SocialButton
            provider="google"
            onPress={() =>
              authClient.signIn.social({ provider: "google", callbackURL: signedInCallbackURL })
            }
          />
          <SocialButton
            provider="apple"
            onPress={() =>
              authClient.signIn.social({ provider: "apple", callbackURL: signedInCallbackURL })
            }
          />
          <OrDivider />

          <View>
            <Text style={styles.label}>EMAIL</Text>
            <Input
              placeholder="reader@baindar.app"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={requestOtp}
              returnKeyType="send"
              wrapStyle={styles.inputWrap}
              style={styles.input}
            />
          </View>

          <Button size="lg" fullWidth disabled={busy || !email.includes("@")} onPress={requestOtp}>
            {busy ? "Sending..." : copy.submit}
          </Button>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.footer}>
          <Text style={styles.switchText}>
            {copy.switchLead}{" "}
            <Text style={styles.switchLink} onPress={() => router.replace(copy.switchTo)}>
              {copy.switchAction}
            </Text>
          </Text>
          <Text style={styles.legal}>
            By continuing, you agree to our{" "}
            <Text style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}>
              Terms
            </Text>{" "}
            and{" "}
            <Text style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
