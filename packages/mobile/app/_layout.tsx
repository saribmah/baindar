import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@baindar/ui";
import { AuthGate } from "../src/features/auth";
import { BillingProvider } from "../src/features/billing";
import {
  profileThemeToUi,
  ProfileProvider,
  uiThemeToProfile,
  useProfile,
} from "../src/features/profile";
import { SDKProvider } from "../src/sdk/sdk.provider.tsx";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces: require("../assets/fonts/Fraunces.ttf"),
    "Inter Tight": require("../assets/fonts/InterTight.ttf"),
    Newsreader: require("../assets/fonts/Newsreader.ttf"),
    "JetBrains Mono": require("../assets/fonts/JetBrainsMono.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <SDKProvider>
        <ProfileProvider>
          <BillingProvider>
            <ThemedAppShell />
          </BillingProvider>
        </ProfileProvider>
      </SDKProvider>
    </SafeAreaProvider>
  );
}

function ThemedAppShell() {
  const { profile, update } = useProfile();
  const theme = profileThemeToUi(profile?.readingTheme);
  return (
    <ThemeProvider
      theme={theme}
      onThemeChange={(next) => {
        void update({ readingTheme: uiThemeToProfile(next) });
      }}
    >
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </AuthGate>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
