import type { ReactNode } from "react";
import { Button, Chip, ChipButton, Icons } from "@baindar/ui";
import { ProfileHighlightColor, ProfileTheme } from "@baindar/sdk";
import { useLibraryDocuments } from "../../library/hooks/useLibraryDocuments";
import { useLibraryHighlights } from "../../library/hooks/useLibraryHighlights";
import { AppSidebar } from "../../library/components/AppSidebar";
import { useLibraryShelves } from "../../library/hooks/useLibraryShelves";
import { signOutProfile } from "../actions";
import { useProfile } from "../ProfileProvider";
import { useProfileName } from "../hooks/useProfileName";
import { useUserProfile } from "../hooks/useUserProfile";

const themes: { value: ProfileTheme; label: string }[] = [
  { value: ProfileTheme.Light, label: "Light" },
  { value: ProfileTheme.Sepia, label: "Sepia" },
  { value: ProfileTheme.Night, label: "Night" },
];

const highlightColors: { value: ProfileHighlightColor; cssVar: string }[] = [
  { value: ProfileHighlightColor.Pink, cssVar: "var(--hl-pink)" },
  { value: ProfileHighlightColor.Yellow, cssVar: "var(--hl-yellow)" },
  { value: ProfileHighlightColor.Green, cssVar: "var(--hl-green)" },
  { value: ProfileHighlightColor.Blue, cssVar: "var(--hl-blue)" },
  { value: ProfileHighlightColor.Purple, cssVar: "var(--hl-purple)" },
];

export function SettingsPage() {
  const reader = useProfileName();
  const { documents, counts, uploading, uploadDocument } = useLibraryDocuments();
  const { highlights } = useLibraryHighlights(documents);
  const { shelves } = useLibraryShelves(documents);
  const { user } = useUserProfile();
  const { profile, update } = useProfile();

  const displayName = user?.name?.trim() || reader;
  const email = user?.email ?? "";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        totalCount={counts.all}
        highlightsCount={highlights?.length ?? 0}
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-16 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bd-surface-raised font-display text-2xl font-medium text-bd-fg-subtle">
              {initials || "R"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="t-label-s text-bd-fg-muted">Settings</div>
              <h1 className="t-display-m mt-0.5 text-bd-fg">{displayName}</h1>
              <div className="t-body-m mt-1 truncate text-bd-fg-subtle">
                {email || "Reader profile"} · {counts.all} imports
              </div>
            </div>
          </div>

          <div>
            <Section label="Reading">
              <Row label="Default theme" sub="Light · Sepia · Night">
                <div className="flex gap-1 rounded-full bg-bd-surface-raised p-1">
                  {themes.map(({ value, label }) => (
                    <ChipButton
                      key={value}
                      variant={profile?.readingTheme === value ? "active" : "filled"}
                      onClick={() => void update({ readingTheme: value })}
                    >
                      {label}
                    </ChipButton>
                  ))}
                </div>
              </Row>
              <Row label="Reading font" sub="Newsreader, Iowan Old Style, Charter, Georgia">
                <Chip variant="outline" iconEnd={<Icons.Chevron size={12} />}>
                  {profile?.readingFont ?? "Newsreader"}
                </Chip>
              </Row>
              <Row label="Default highlight color" sub="The color when you tap Highlight">
                <div className="flex gap-1.5">
                  {highlightColors.map(({ value, cssVar }) => {
                    const active = profile?.defaultHighlightColor === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-label={value}
                        aria-pressed={active}
                        onClick={() => void update({ defaultHighlightColor: value })}
                        className="h-6 w-6 rounded-full border-0 p-0"
                        style={{
                          background: cssVar,
                          outline: active ? "2px solid var(--bd-fg)" : "2px solid transparent",
                          outlineOffset: 1,
                        }}
                      />
                    );
                  })}
                </div>
              </Row>
            </Section>

            <Section label="AI · Baindar">
              <Row label="Cite the page in every answer" sub="Show page or section references">
                <Toggle
                  checked={profile?.aiCitePages ?? false}
                  onChange={() => void update({ aiCitePages: !(profile?.aiCitePages ?? false) })}
                />
              </Row>
              <Row label="Suggest follow-up questions" sub="Three contextual chips after answers">
                <Toggle
                  checked={profile?.aiSuggestFollowups ?? false}
                  onChange={() =>
                    void update({ aiSuggestFollowups: !(profile?.aiSuggestFollowups ?? false) })
                  }
                />
              </Row>
              <Row
                label="Use my highlights to personalize"
                sub="Baindar learns what passages matter"
              >
                <Toggle
                  checked={profile?.aiPersonalizeFromHighlights ?? false}
                  onChange={() =>
                    void update({
                      aiPersonalizeFromHighlights: !(profile?.aiPersonalizeFromHighlights ?? false),
                    })
                  }
                />
              </Row>
            </Section>

            <Section label="Account">
              <Row label="Email" sub={email || "Not available"} />
              <Row label="Plan" sub={`${counts.all} imports / unlimited reading`}>
                <Chip variant="outline">Free</Chip>
              </Row>
              <Row label="Session" sub="Sign out of this device">
                <Button variant="wine" size="sm" onClick={signOutProfile}>
                  Sign out
                </Button>
              </Row>
            </Section>

            <Section label="Notifications">
              <Row label="Daily reading nudge" sub="A quiet evening reminder">
                <Toggle
                  checked={profile?.notifyDailyNudge ?? false}
                  onChange={() =>
                    void update({ notifyDailyNudge: !(profile?.notifyDailyNudge ?? false) })
                  }
                />
              </Row>
              <Row label="Weekly digest" sub="What you read, highlighted, and asked about">
                <Toggle
                  checked={profile?.notifyWeeklyDigest ?? false}
                  onChange={() =>
                    void update({ notifyWeeklyDigest: !(profile?.notifyWeeklyDigest ?? false) })
                  }
                />
              </Row>
            </Section>
          </div>
        </div>
      </section>
    </main>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-bd-border py-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div className="t-label-s text-bd-fg-muted">{label}</div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="t-label-l text-bd-fg">{label}</div>
        {sub && <div className="t-body-s mt-0.5 text-bd-fg-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className="relative h-[22px] w-10 rounded-full border-0 transition-colors"
      style={{ background: checked ? "var(--bd-fg)" : "var(--bd-border-strong)" }}
    >
      <span
        className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-bd-bg shadow-sm transition-[left]"
        style={{ left: checked ? 20 : 2 }}
      />
    </button>
  );
}
