import { eq } from "drizzle-orm";
import { profile } from "../db/schema";
import { Instance } from "../instance";
import { Profile } from "./profile";

export namespace ProfileStore {
  export const entitySelect = {
    userId: profile.userId,
    readingTheme: profile.readingTheme,
    readingFont: profile.readingFont,
    defaultHighlightColor: profile.defaultHighlightColor,
    aiCitePages: profile.aiCitePages,
    aiSuggestFollowups: profile.aiSuggestFollowups,
    aiPersonalizeFromHighlights: profile.aiPersonalizeFromHighlights,
    notifyDailyNudge: profile.notifyDailyNudge,
    notifyWeeklyDigest: profile.notifyWeeklyDigest,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  } as const;

  export type EntityRow = {
    userId: string;
    readingTheme: string;
    readingFont: string;
    defaultHighlightColor: string;
    aiCitePages: boolean;
    aiSuggestFollowups: boolean;
    aiPersonalizeFromHighlights: boolean;
    notifyDailyNudge: boolean;
    notifyWeeklyDigest: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  export const toEntity = (row: EntityRow): Profile.Entity => ({
    userId: row.userId,
    readingTheme: parseTheme(row.readingTheme),
    readingFont: row.readingFont,
    defaultHighlightColor: parseHighlightColor(row.defaultHighlightColor),
    aiCitePages: row.aiCitePages,
    aiSuggestFollowups: row.aiSuggestFollowups,
    aiPersonalizeFromHighlights: row.aiPersonalizeFromHighlights,
    notifyDailyNudge: row.notifyDailyNudge,
    notifyWeeklyDigest: row.notifyWeeklyDigest,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  const parseTheme = (raw: string): Profile.Theme => {
    if (raw === "light" || raw === "sepia" || raw === "night") return raw;
    return "light";
  };

  const parseHighlightColor = (raw: string): Profile.HighlightColor => {
    if (
      raw === "pink" ||
      raw === "yellow" ||
      raw === "green" ||
      raw === "blue" ||
      raw === "purple"
    ) {
      return raw;
    }
    return "pink";
  };

  export const get = async (userId: string): Promise<Profile.Entity | null> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const insertDefaults = async (
    userId: string,
    defaults: Omit<Profile.Entity, "userId" | "createdAt" | "updatedAt">,
  ): Promise<Profile.Entity> => {
    const now = new Date();
    const rows = await Instance.db
      .insert(profile)
      .values({
        userId,
        ...defaults,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(entitySelect);
    const row = rows[0];
    if (row) return toEntity(row);
    // Race: another caller seeded the row first. Read it back.
    const existing = await get(userId);
    if (!existing) {
      throw new Error("ProfileStore.insertDefaults: row missing after insert race");
    }
    return existing;
  };

  export const update = async (
    userId: string,
    patch: Profile.UpdateInput,
  ): Promise<Profile.Entity | null> => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.readingTheme !== undefined) set["readingTheme"] = patch.readingTheme;
    if (patch.readingFont !== undefined) set["readingFont"] = patch.readingFont;
    if (patch.defaultHighlightColor !== undefined) {
      set["defaultHighlightColor"] = patch.defaultHighlightColor;
    }
    if (patch.aiCitePages !== undefined) set["aiCitePages"] = patch.aiCitePages;
    if (patch.aiSuggestFollowups !== undefined) {
      set["aiSuggestFollowups"] = patch.aiSuggestFollowups;
    }
    if (patch.aiPersonalizeFromHighlights !== undefined) {
      set["aiPersonalizeFromHighlights"] = patch.aiPersonalizeFromHighlights;
    }
    if (patch.notifyDailyNudge !== undefined) set["notifyDailyNudge"] = patch.notifyDailyNudge;
    if (patch.notifyWeeklyDigest !== undefined) {
      set["notifyWeeklyDigest"] = patch.notifyWeeklyDigest;
    }

    const rows = await Instance.db
      .update(profile)
      .set(set)
      .where(eq(profile.userId, userId))
      .returning(entitySelect);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };
}
