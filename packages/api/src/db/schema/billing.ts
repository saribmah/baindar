import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// One row per user. Absence implies the implicit `free` plan — we lazily
// upsert the row the first time billing state is read or a webhook lands.
// `plan` and `status` are stored as raw strings; the feature module narrows
// them to Plan / SubscriptionStatus enums via parsers at the boundary.
export const subscription = sqliteTable("subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Monthly rollup per user. Composite PK on (user_id, period_start) so the
// historical rows survive month rollover and can be queried for cost reports.
// Counters are stored as integers; cost is in millionths-of-a-dollar
// (micros) to avoid floating point drift across many small recordings.
export const usagePeriod = sqliteTable(
  "usage_period",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
    chatTurns: integer("chat_turns").notNull().default(0),
    summaries: integer("summaries").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.periodStart] })],
);

// Append-only ledger of every billable AI operation. Indexed on
// (user_id, created_at) so the "my recent usage" UI and cost-report
// scripts can paginate without scanning the table. `byok=true` events
// are recorded for the user's own visibility but do not increment the
// owning UsagePeriod's `chat_turns` / `summaries` counters.
export const usageEvent = sqliteTable(
  "usage_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    byok: integer("byok", { mode: "boolean" }).notNull().default(false),
    sourceId: text("source_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("usage_event_user_created_idx").on(table.userId, table.createdAt)],
);
