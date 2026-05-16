import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BillingPlan, type BillingStatus } from "@baindar/sdk";
import {
  Button,
  Icons,
  Wordmark,
  font,
  radius,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from "@baindar/ui";
import { authClient } from "../../auth";
import { BILLING_PLANS, type BillingPlanDetails } from "../planData";
import { useBillingStatus } from "../hooks/useBillingStatus";

export function PlansScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  const session = authClient.useSession();
  const { billing } = useBillingStatus();
  const signedIn = !!session.data?.user;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
      ]}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace(signedIn ? "/dashboard" : "/")}
          style={styles.iconButton}
        >
          <Icons.Close size={14} color={palette.fg} />
        </Pressable>
        <Wordmark size="sm" />
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>PLANS</Text>
        <Text style={styles.title}>
          Read deeper.{"\n"}
          Lift the cap.
        </Text>
        <Text style={styles.bodyMuted}>
          Four plans. Cancel any time. Your documents stay yours when you downgrade.
        </Text>
      </View>

      <View style={styles.planList}>
        {BILLING_PLANS.map((plan) => (
          <MobilePlanCard key={plan.id} plan={plan} billing={billing} signedIn={signedIn} />
        ))}
      </View>

      {!signedIn && (
        <View style={styles.footerActions}>
          <Button size="md" fullWidth onPress={() => router.push("/signup")}>
            Get started free
          </Button>
          <Button variant="ghost" size="sm" fullWidth onPress={() => router.push("/signin")}>
            I already have an account
          </Button>
        </View>
      )}
    </ScrollView>
  );
}

function MobilePlanCard({
  plan,
  billing,
  signedIn,
}: {
  plan: BillingPlanDetails;
  billing: BillingStatus | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const styles = useThemedStyles(buildStyles);
  const palette = useThemeColors();
  const current = billing?.plan === plan.id;
  const featured = plan.featured === true;
  const checkoutUrl = billing?.upgradeOptions.find(
    (option) => option.plan === plan.id,
  )?.checkoutUrl;
  const onPress = () => {
    if (current) {
      if (billing?.portalUrl) void Linking.openURL(billing.portalUrl);
      return;
    }
    if (!signedIn) {
      router.push("/signup");
      return;
    }
    if (checkoutUrl) {
      void Linking.openURL(checkoutUrl);
    }
  };
  const disabled =
    (current && !billing?.portalUrl) ||
    (signedIn && !billing) ||
    (signedIn && plan.id === BillingPlan.Free && !current) ||
    (signedIn && !checkoutUrl && plan.id !== BillingPlan.Free);

  return (
    <View
      style={[
        styles.planCard,
        {
          backgroundColor: featured ? palette.fg : palette.bg,
          borderColor: featured ? "transparent" : palette.border,
          shadowOpacity: featured ? 0.12 : 0,
        },
      ]}
    >
      {featured && <Text style={styles.featuredPill}>Most chosen</Text>}
      <View style={styles.planTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: featured ? palette.bg : palette.fg }]}>
            {plan.name}
          </Text>
          <Text style={[styles.planTagline, { color: featured ? palette.bg : palette.fgMuted }]}>
            {plan.tagline}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: featured ? palette.bg : palette.fg }]}>
            ${plan.price}
          </Text>
          <Text style={[styles.priceCadence, { color: featured ? palette.bg : palette.fgMuted }]}>
            {plan.cadence}
          </Text>
        </View>
      </View>

      <View style={styles.featureRow}>
        {plan.features.slice(0, 3).map((feature) => (
          <Text
            key={feature.label}
            style={[
              styles.featurePill,
              {
                color: featured ? palette.bg : palette.fgSubtle,
                backgroundColor: featured ? "rgba(255,255,255,0.10)" : palette.surfaceRaised,
              },
            ]}
          >
            {feature.value} {feature.label.split(" ")[0].toLowerCase()}
          </Text>
        ))}
      </View>

      <Button
        size="sm"
        variant={featured ? "secondary" : plan.id === BillingPlan.Free ? "secondary" : "primary"}
        fullWidth
        disabled={disabled}
        onPress={onPress}
      >
        {current
          ? "Manage Plan"
          : !signedIn
            ? plan.id === BillingPlan.Free
              ? "Start free"
              : `Choose ${plan.name}`
            : plan.id === BillingPlan.Byok
              ? "Bring your key"
              : plan.id === BillingPlan.Free
                ? "Included"
                : `Upgrade to ${plan.name}`}
      </Button>
    </View>
  );
}

const buildStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      paddingHorizontal: 20,
      gap: 16,
    },
    nav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.surfaceRaised,
    },
    header: {
      gap: 7,
    },
    eyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.44,
      color: palette.fgMuted,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 32,
      fontWeight: "400",
      lineHeight: 34,
      color: palette.fg,
    },
    bodyMuted: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      lineHeight: 17,
      color: palette.fgMuted,
    },
    planList: {
      gap: 12,
    },
    planCard: {
      position: "relative",
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: 14,
      gap: 12,
      shadowColor: palette.fg,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 28,
      elevation: 3,
    },
    featuredPill: {
      position: "absolute",
      top: -8,
      right: 14,
      overflow: "hidden",
      borderRadius: 999,
      backgroundColor: palette.accent,
      paddingHorizontal: 8,
      paddingVertical: 3,
      fontFamily: font.nativeFamily.ui,
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.54,
      color: palette.accentFg,
      textTransform: "uppercase",
    },
    planTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    planName: {
      fontFamily: font.nativeFamily.display,
      fontSize: 19,
      fontWeight: "500",
    },
    planTagline: {
      marginTop: 3,
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      lineHeight: 16,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 2,
    },
    price: {
      fontFamily: font.nativeFamily.display,
      fontSize: 26,
      fontWeight: "500",
    },
    priceCadence: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
    },
    featureRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    },
    featurePill: {
      overflow: "hidden",
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontFamily: font.nativeFamily.ui,
      fontSize: 10,
      fontWeight: "600",
    },
    footerActions: {
      gap: 8,
    },
  });
