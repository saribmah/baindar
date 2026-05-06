import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { document } from "./document";

// User-owned chat thread. The id doubles as the Durable Object instance name
// for ChatAgent (wired in a follow-up PR — today the DO is still keyed by
// userId), so it must be globally unique and stable for the conversation's
// lifetime.
//
// `primary_doc_id` is a soft "started here" hint set when a conversation is
// opened from inside the reader. It powers reader-side resume lookups and a
// sidebar badge; it does NOT scope what the chat agent can read. Cascading
// on document delete keeps the model simple — if the user deletes the source
// doc, the conversation about it goes with it.
//
// `last_activity_at` drives sidebar ordering and is updated on every chat
// turn (also wired in a follow-up PR). It's separate from a row-level
// `updated_at` because we want chat-activity recency, not row-mutation
// recency.
export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    primaryDocId: text("primary_doc_id").references(() => document.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    // Millisecond resolution: chat turns can land in the same second, and
    // sidebar ordering depends on this column. Other tables use second
    // resolution because their order-by columns are user-mutation-driven.
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("conversation_user_id_last_activity_idx").on(table.userId, table.lastActivityAt),
    index("conversation_primary_doc_id_idx").on(table.primaryDocId),
  ],
);
