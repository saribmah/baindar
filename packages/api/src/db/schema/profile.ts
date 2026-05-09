import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// One profile row per user. Holds application-level reading/AI/notification
// preferences that don't belong on the Better-Auth-owned `user` table. Created
// lazily on first read by ProfileStore; cascades on user delete.
export const profile = sqliteTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  readingTheme: text("reading_theme").notNull().default("light"),
  readingFont: text("reading_font").notNull().default("newsreader"),
  defaultHighlightColor: text("default_highlight_color").notNull().default("pink"),
  aiCitePages: integer("ai_cite_pages", { mode: "boolean" }).notNull().default(true),
  aiSuggestFollowups: integer("ai_suggest_followups", { mode: "boolean" }).notNull().default(true),
  aiPersonalizeFromHighlights: integer("ai_personalize_from_highlights", { mode: "boolean" })
    .notNull()
    .default(false),
  notifyDailyNudge: integer("notify_daily_nudge", { mode: "boolean" }).notNull().default(true),
  notifyWeeklyDigest: integer("notify_weekly_digest", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
