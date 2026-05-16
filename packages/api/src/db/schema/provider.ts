import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// One row per user. Absence means the user has no provider configured
// and the platform key is used. We deliberately store provider-agnostic
// fields (`spec` is "anthropic" | "openai") so this table extends to any
// OpenAI-compatible endpoint (LiteLLM, OpenRouter, Together, local LLMs)
// without further schema changes.
//
// `encrypted_api_key` is opaque ciphertext (AES-GCM with IV prepended).
// The plaintext key is never persisted and never returned to the client —
// the read API only exposes the last 4 chars of the key.
export const userProviderSettings = sqliteTable("user_provider_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  spec: text("spec").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedApiKey: blob("encrypted_api_key", { mode: "buffer" }).notNull(),
  keyLastFour: text("key_last_four").notNull(),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
