import { useEffect, useRef, type ReactNode } from "react";
import { Redirect, usePathname, useSegments } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useThemeColors } from "@baindar/ui";
import { authClient } from "./auth.client.ts";

export function AuthGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const palette = useThemeColors();
  const inSignIn = segments[0] === "signin";
  const inSignUp = segments[0] === "signup";
  const inPlans = segments[0] === "plans";
  const inLanding = pathname === "/";
  const inPublicRoute = inLanding || inPlans || inSignIn || inSignUp;
  const isAuthed = !!session.data?.user;

  // Track whether we've ever resolved a session. Better Auth flips
  // `isPending` to true on background refetch (e.g. when the app returns
  // from foreground). Returning a different element tree during refetch
  // unmounts the navigation Stack and destroys local screen state — this
  // is what was wiping the OTP screen mid-flow. After the first resolution,
  // keep children mounted regardless of refetch state.
  const hasResolvedRef = useRef(false);
  if (!session.isPending) hasResolvedRef.current = true;
  useEffect(() => {
    if (!session.isPending) hasResolvedRef.current = true;
  }, [session.isPending]);

  if (session.isPending && !hasResolvedRef.current) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.fgMuted} />
      </View>
    );
  }
  if (!isAuthed && !inPublicRoute) {
    return <Redirect href="/" />;
  }
  if (isAuthed && (inSignIn || inSignUp)) {
    return <Redirect href="/dashboard" />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
