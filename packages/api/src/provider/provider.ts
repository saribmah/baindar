import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { NamedError } from "../utils/error";
import { decryptApiKey, encryptApiKey, lastFourOf } from "./crypto";
import { ProviderStore } from "./provider-store";

// Provider namespace: user-supplied AI provider credentials. Persisted
// encrypted; never returned in cleartext via the API. Used by ChatAgent
// to bypass platform metering when a BYOK user has a key configured.
//
// We intentionally model "spec" rather than "provider name" so the same
// row works for Anthropic, OpenAI, OpenRouter, LiteLLM, Together,
// self-hosted vLLM, etc. — any endpoint that speaks one of the two
// common wire protocols.
export namespace Provider {
  export const Spec = z.enum(["anthropic", "openai"]).meta({ ref: "ProviderSpec" });
  export type Spec = z.infer<typeof Spec>;

  // The sanitized read shape. Never includes the decrypted API key — the
  // frontend gets only the last 4 chars so it can render a "···· abcd"
  // pill confirming which key is on file.
  export const Entity = z
    .object({
      spec: Spec,
      baseUrl: z.string(),
      model: z.string(),
      keyLastFour: z.string(),
      lastValidatedAt: z.string().nullable(),
      lastUsedAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "ProviderSettings" });
  export type Entity = z.infer<typeof Entity>;

  // Read response wraps the entity in `{ configured, settings }` so the
  // "not configured" case has a single canonical shape instead of leaning
  // on `null` everywhere.
  export const StatusResponse = z
    .object({
      configured: z.boolean(),
      settings: Entity.nullable(),
    })
    .meta({ ref: "ProviderStatus" });
  export type StatusResponse = z.infer<typeof StatusResponse>;

  export const SetInput = z
    .object({
      spec: Spec,
      baseUrl: z.string().url(),
      model: z.string().min(1),
      apiKey: z.string().min(8),
    })
    .meta({ ref: "ProviderSetInput" });
  export type SetInput = z.infer<typeof SetInput>;

  // ---- Errors -----------------------------------------------------------
  export const InvalidKeyError = NamedError.create(
    "ProviderInvalidKeyError",
    z.object({ reason: z.string(), message: z.string().optional() }),
  );
  export type InvalidKeyError = InstanceType<typeof InvalidKeyError>;

  export const NotConfiguredError = NamedError.create(
    "ProviderNotConfiguredError",
    z.object({ message: z.string().optional() }),
  );
  export type NotConfiguredError = InstanceType<typeof NotConfiguredError>;

  // ---- Public API -------------------------------------------------------
  export const get = async (userId: string): Promise<StatusResponse> => {
    const row = await ProviderStore.getSettings(userId);
    return row ? { configured: true, settings: row } : { configured: false, settings: null };
  };

  // Validates the key by issuing a 1-token completion through the
  // appropriate SDK adapter, then persists encrypted. Validation cost is
  // ~$0.00001; cheaper than handing the user a broken "saved" state.
  export const set = async (input: SetInput & { userId: string }): Promise<Entity> => {
    await validateKey(input).catch((err) => {
      const reason = err instanceof Error ? err.message : String(err);
      throw new InvalidKeyError({
        reason,
        message: `Provider rejected the key during validation: ${reason}`,
      });
    });
    const encrypted = await encryptApiKey(input.apiKey);
    return ProviderStore.upsertSettings({
      userId: input.userId,
      spec: input.spec,
      baseUrl: input.baseUrl,
      model: input.model,
      encryptedApiKey: encrypted,
      keyLastFour: lastFourOf(input.apiKey),
      lastValidatedAt: new Date(),
    });
  };

  export const remove = async (userId: string): Promise<void> => {
    await ProviderStore.deleteSettings(userId);
  };

  // Returns the decrypted config for runtime use (ChatAgent). Updates
  // last_used_at as a side effect so the UI can show recency. Returns
  // null when the user has no configured provider.
  export type ResolvedConfig = {
    spec: Spec;
    baseUrl: string;
    model: string;
    apiKey: string;
  };

  export const resolveForChat = async (userId: string): Promise<ResolvedConfig | null> => {
    const sealed = await ProviderStore.getRawSettings(userId);
    if (!sealed) return null;
    const apiKey = await decryptApiKey(sealed.encryptedApiKey);
    await ProviderStore.touchLastUsed(userId).catch(() => {});
    const specParsed = Spec.safeParse(sealed.spec);
    if (!specParsed.success) return null;
    return { spec: specParsed.data, baseUrl: sealed.baseUrl, model: sealed.model, apiKey };
  };

  // Fast "is this user using BYOK?" check — used by the quota middleware
  // to skip its 402 path without decrypting the key.
  export const hasConfigured = async (userId: string): Promise<boolean> => {
    return ProviderStore.hasSettings(userId);
  };

  // ---- Internal helpers -------------------------------------------------
  const validateKey = async (input: SetInput): Promise<void> => {
    if (input.spec === "anthropic") {
      const anthropic = createAnthropic({ apiKey: input.apiKey, baseURL: input.baseUrl });
      await generateText({
        model: anthropic(input.model),
        prompt: "ok",
        maxOutputTokens: 1,
      });
      return;
    }
    const openai = createOpenAI({ apiKey: input.apiKey, baseURL: input.baseUrl });
    await generateText({
      model: openai(input.model),
      prompt: "ok",
      maxOutputTokens: 1,
    });
  };
}
