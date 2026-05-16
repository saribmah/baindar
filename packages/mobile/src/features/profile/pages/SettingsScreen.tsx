import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipButton, Icons, Wordmark, useThemeColors, useThemedStyles } from "@baindar/ui";
import { ProfileHighlightColor, ProfileTheme } from "@baindar/sdk";
import { BillingGroup, UsageMeter, useBillingStatus } from "../../billing";
import { useLibraryDocuments } from "../../library/hooks/useLibraryDocuments";
import { buildLibraryStyles } from "../../library/library.styles";
import { signOutProfile } from "../actions";
import { useProfile } from "../ProfileProvider";
import { useProfileName } from "../hooks/useProfileName";
import { useUserProfile } from "../hooks/useUserProfile";
import { buildProfileStyles } from "../profile.styles";

const themes: { value: ProfileTheme; label: string }[] = [
  { value: ProfileTheme.Light, label: "Light" },
  { value: ProfileTheme.Sepia, label: "Sepia" },
  { value: ProfileTheme.Night, label: "Night" },
];

const highlightColors: ProfileHighlightColor[] = [
  ProfileHighlightColor.Pink,
  ProfileHighlightColor.Yellow,
  ProfileHighlightColor.Green,
  ProfileHighlightColor.Blue,
  ProfileHighlightColor.Purple,
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const reader = useProfileName();
  const { counts } = useLibraryDocuments();
  const { user } = useUserProfile();
  const { profile, update } = useProfile();
  const { billing } = useBillingStatus();
  const styles = useThemedStyles(buildProfileStyles);
  const libraryStyles = useThemedStyles(buildLibraryStyles);
  const palette = useThemeColors();

  const displayName = user?.name?.trim() || reader;
  const email = user?.email ?? "";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <View style={libraryStyles.root}>
      <ScrollView
        style={libraryStyles.scroll}
        contentContainerStyle={[
          libraryStyles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
      >
        <View style={libraryStyles.header}>
          <Wordmark size="sm" />
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || "R"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.settingSub}>{email || "Reader profile"}</Text>
          </View>
        </View>

        {billing && <UsageMeter billing={billing} />}

        <Group label="Reading">
          <Row label="Theme" sub="Light · Sepia · Night">
            <View style={{ flexDirection: "row", gap: 4 }}>
              {themes.map(({ value, label }) => (
                <ChipButton
                  key={value}
                  variant={profile?.readingTheme === value ? "active" : "filled"}
                  onPress={() => void update({ readingTheme: value })}
                >
                  {label}
                </ChipButton>
              ))}
            </View>
          </Row>
          <Row label="Reading font">
            <Text style={styles.settingSub}>{profile?.readingFont ?? "Newsreader"}</Text>
          </Row>
          <Row label="Highlight color" last>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {highlightColors.map((value) => {
                const active = profile?.defaultHighlightColor === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={value}
                    accessibilityState={{ selected: active }}
                    onPress={() => void update({ defaultHighlightColor: value })}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: highlightColorToHex(value),
                      borderWidth: active ? 2 : 0,
                      borderColor: palette.fg,
                    }}
                  />
                );
              })}
            </View>
          </Row>
        </Group>

        <Group label="AI">
          <Row label="Cite pages in answers">
            <Toggle
              checked={profile?.aiCitePages ?? false}
              onPress={() => void update({ aiCitePages: !(profile?.aiCitePages ?? false) })}
            />
          </Row>
          <Row label="Suggest follow-ups">
            <Toggle
              checked={profile?.aiSuggestFollowups ?? false}
              onPress={() =>
                void update({ aiSuggestFollowups: !(profile?.aiSuggestFollowups ?? false) })
              }
            />
          </Row>
          <Row label="Personalize from highlights" last>
            <Toggle
              checked={profile?.aiPersonalizeFromHighlights ?? false}
              onPress={() =>
                void update({
                  aiPersonalizeFromHighlights: !(profile?.aiPersonalizeFromHighlights ?? false),
                })
              }
            />
          </Row>
        </Group>

        <Group label="Notifications">
          <Row label="Daily reading nudge">
            <Toggle
              checked={profile?.notifyDailyNudge ?? false}
              onPress={() =>
                void update({ notifyDailyNudge: !(profile?.notifyDailyNudge ?? false) })
              }
            />
          </Row>
          <Row label="Weekly digest" last>
            <Toggle
              checked={profile?.notifyWeeklyDigest ?? false}
              onPress={() =>
                void update({ notifyWeeklyDigest: !(profile?.notifyWeeklyDigest ?? false) })
              }
            />
          </Row>
        </Group>

        <Group label="Account">
          <Row label="Email" sub={email || "Not available"} />
          <Row label="Imports" sub={`${counts.all} documents in your binder`} />
          <Row label="Sign out" onPress={signOutProfile} last>
            <Icons.Chevron size={14} color={palette.fgMuted} />
          </Row>
        </Group>

        {billing && <BillingGroup billing={billing} />}
      </ScrollView>
    </View>
  );
}

function highlightColorToHex(value: ProfileHighlightColor): string {
  switch (value) {
    case ProfileHighlightColor.Pink:
      return "#ffd5e0";
    case ProfileHighlightColor.Yellow:
      return "#fff0b4";
    case ProfileHighlightColor.Green:
      return "#cdeacf";
    case ProfileHighlightColor.Blue:
      return "#cfe1f2";
    case ProfileHighlightColor.Purple:
      return "#e2d4f0";
  }
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const styles = useThemedStyles(buildProfileStyles);
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  sub,
  children,
  last,
  onPress,
}: {
  label: string;
  sub?: string;
  children?: ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(buildProfileStyles);
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sub && <Text style={styles.settingSub}>{sub}</Text>}
      </View>
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.settingRow, last ? { borderBottomWidth: 0 } : null]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.settingRow, last ? { borderBottomWidth: 0 } : null]}>{body}</View>;
}

function Toggle({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  const styles = useThemedStyles(buildProfileStyles);
  const palette = useThemeColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[
        styles.toggle,
        {
          backgroundColor: checked ? palette.action : palette.borderStrong,
          alignItems: checked ? "flex-end" : "flex-start",
        },
      ]}
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}
