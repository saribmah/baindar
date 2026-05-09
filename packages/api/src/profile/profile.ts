import { z } from "zod";
import { NamedError } from "../utils/error";
import { ProfileStore } from "./profile-store";

export namespace Profile {
  export const NotFoundError = NamedError.create(
    "ProfileNotFoundError",
    z.object({ userId: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  export const Theme = z.enum(["light", "sepia", "night"]).meta({ ref: "ProfileTheme" });
  export type Theme = z.infer<typeof Theme>;

  export const HighlightColor = z
    .enum(["pink", "yellow", "green", "blue", "purple"])
    .meta({ ref: "ProfileHighlightColor" });
  export type HighlightColor = z.infer<typeof HighlightColor>;

  export const Entity = z
    .object({
      userId: z.string(),
      readingTheme: Theme,
      readingFont: z.string(),
      defaultHighlightColor: HighlightColor,
      aiCitePages: z.boolean(),
      aiSuggestFollowups: z.boolean(),
      aiPersonalizeFromHighlights: z.boolean(),
      notifyDailyNudge: z.boolean(),
      notifyWeeklyDigest: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "Profile" });
  export type Entity = z.infer<typeof Entity>;

  export const UpdateInput = z.object({
    readingTheme: Theme.optional(),
    readingFont: z.string().min(1).max(64).optional(),
    defaultHighlightColor: HighlightColor.optional(),
    aiCitePages: z.boolean().optional(),
    aiSuggestFollowups: z.boolean().optional(),
    aiPersonalizeFromHighlights: z.boolean().optional(),
    notifyDailyNudge: z.boolean().optional(),
    notifyWeeklyDigest: z.boolean().optional(),
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const defaults = {
    readingTheme: "light" as Theme,
    readingFont: "newsreader",
    defaultHighlightColor: "pink" as HighlightColor,
    aiCitePages: true,
    aiSuggestFollowups: true,
    aiPersonalizeFromHighlights: false,
    notifyDailyNudge: true,
    notifyWeeklyDigest: true,
  } as const;

  // Lazy upsert: a profile row is created with defaults the first time the
  // owner asks for it. Keeps user-creation in Better Auth's flow simple and
  // avoids an extra hook just to seed preferences.
  export const getMe = async (userId: string): Promise<Entity> => {
    const existing = await ProfileStore.get(userId);
    if (existing) return existing;
    return ProfileStore.insertDefaults(userId, defaults);
  };

  export const updateMe = async (userId: string, input: UpdateInput): Promise<Entity> => {
    await getMe(userId);
    const updated = await ProfileStore.update(userId, input);
    if (!updated) throw new NotFoundError({ userId });
    return updated;
  };
}
