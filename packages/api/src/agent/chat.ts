import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { AuthContext, RuntimeEnv } from "../app/context";
import { Billing } from "../billing/billing";
import { Conversation } from "../conversation/conversation";
import { createDb } from "../db/db";
import { Instance } from "../instance";
import { Provider } from "../provider/provider";
import {
  referenceDataPartToModelPart,
  validateReferenceDataParts,
  type BaindarAgentMessage,
} from "./message-reference";
import { SYSTEM_PROMPT } from "./prompt";
import { buildAgentTools } from "./tools";
import { trimToTokenBudget } from "./trim-token-budget";

// ChatAgent — per-conversation Durable Object. Identity is composite:
// `idFromName(\`${userId}:${conversationId}\`)` so reverse-resolving owner
// from instance name is just a string split. `init({userId, conversationId})`
// is called once at conversation creation; persists the pair to DO storage
// so resolveUserId() survives DO restarts without ever needing a global
// lookup. Storage parsing of `this.name` is the cold-start fallback.
//
// Tools: typed and bounded. The model can never supply userId — it's
// captured from DO storage and passed into `buildAgentTools`. See
// `.agents/ai-layer-prd.md` §11 + §14.
export class ChatAgent extends AIChatAgent<RuntimeEnv> {
  // Cache the userId + conversationId for the lifetime of this DO
  // instance. Reads from DO storage on first miss; falls back to parsing
  // the composite instance name.
  private cachedUserId: string | null = null;
  private cachedConversationId: string | null = null;

  // Persist `(userId, conversationId)` so subsequent restarts don't need
  // to re-parse `this.name`. Idempotent — the conversation can't change
  // owners, and the route layer calls this once at create time.
  async init(input: { userId: string; conversationId: string }): Promise<void> {
    await this.ctx.storage.put("userId", input.userId);
    await this.ctx.storage.put("conversationId", input.conversationId);
    this.cachedUserId = input.userId;
    this.cachedConversationId = input.conversationId;
  }

  // Wipe DO storage. Mirrors AIChatAgent's `destroy()` which the agents
  // framework provides; we override to clear our owner-tracking keys
  // before delegating. Safe under repeated calls — DELETE handler may
  // hit this on an already-cleared instance.
  override async destroy(): Promise<void> {
    this.cachedUserId = null;
    this.cachedConversationId = null;
    await super.destroy();
  }

  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Response | undefined> {
    const db = createDb(this.env);
    const { userId, conversationId } = await this.resolveOwner();
    if (!userId || !conversationId) {
      return new Response("Conversation not found", { status: 404 });
    }

    return Instance.provide({ auth: agentAuth(userId), env: this.env, db }, async () => {
      const messages = this.messages as BaindarAgentMessage[];
      const referenceValidation = validateReferenceDataParts(messages);
      if (!referenceValidation.ok) {
        return new Response(referenceValidation.message, { status: 400 });
      }

      // Bump last_activity_at so the sidebar reorders. Silent no-op if the
      // row vanished mid-turn.
      await Conversation.touch(userId, conversationId).catch(() => {});

      // Resolve the model adapter. When the user has a BYOK provider on
      // file, we use it directly — their key, their base URL, their
      // model. Otherwise we fall through to the platform Anthropic key.
      const provider = await Provider.resolveForChat(userId).catch(() => null);
      const model: LanguageModel = provider
        ? buildModelFromProvider(provider)
        : createAnthropic({
            apiKey: this.env.ANTHROPIC_API_KEY,
            baseURL: this.env.ANTHROPIC_BASE_URL || undefined,
          })(this.env.ANTHROPIC_MODEL);
      const usingByok = provider !== null;
      const tools: ToolSet = buildAgentTools({ userId });
      // Wrap the framework-supplied onFinish so we can meter token usage
      // before delegating. Recording is best-effort: a billing write failure
      // must never break the user-facing stream, so errors are caught and
      // logged. The append-only UsageEvent ledger lets us reconcile lost
      // rollups later if needed.
      //
      // BYOK turns still write a ledger row (so the user's own usage UI
      // can show what they would have paid) but the rollup skips quota
      // counters — see Billing.recordUsage.
      const meteredOnFinish: StreamTextOnFinishCallback<ToolSet> = async (event) => {
        try {
          const totalUsage = event.totalUsage ?? event.usage;
          await Billing.recordUsage({
            userId,
            kind: "chat",
            inputTokens: totalUsage?.inputTokens ?? 0,
            outputTokens: totalUsage?.outputTokens ?? 0,
            sourceId: conversationId,
            byok: usingByok,
          });
        } catch (err) {
          console.error("[billing] chat usage record failed", err);
        }
        await onFinish(event);
      };
      const modelMessages = await convertToModelMessages(messages, {
        convertDataPart: referenceDataPartToModelPart,
      });
      const trimmedMessages = trimToTokenBudget(modelMessages);
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: trimmedMessages,
        abortSignal: options?.abortSignal,
        tools,
        // Cap the model→tool→model loop. Typed tools (Phase 5) finish in
        // 1–3 rounds for most queries; 12 leaves headroom for chained
        // search→read→search-followup flows without runaway loops.
        stopWhen: stepCountIs(12),
        onFinish: meteredOnFinish,
      });
      return result.toUIMessageStreamResponse();
    });
  }

  private async resolveOwner(): Promise<{
    userId: string | null;
    conversationId: string | null;
  }> {
    if (this.cachedUserId && this.cachedConversationId) {
      return { userId: this.cachedUserId, conversationId: this.cachedConversationId };
    }
    const stored = await Promise.all([
      this.ctx.storage.get<string>("userId"),
      this.ctx.storage.get<string>("conversationId"),
    ]);
    let userId = stored[0] ?? null;
    let conversationId = stored[1] ?? null;
    // Cold-start fallback: parse the composite DO name. Production
    // populates storage via `init()` so this branch only fires for
    // DOs activated before the first init call (e.g. a stray request
    // race after BinderDO.createConversation but before Agent.init).
    if (!userId || !conversationId) {
      const parsed = parseComposite(this.name);
      if (parsed) {
        userId = userId ?? parsed.userId;
        conversationId = conversationId ?? parsed.conversationId;
      }
    }
    if (userId) this.cachedUserId = userId;
    if (conversationId) this.cachedConversationId = conversationId;
    return { userId, conversationId };
  }
}

const parseComposite = (name: string): { userId: string; conversationId: string } | null => {
  const colon = name.indexOf(":");
  if (colon <= 0 || colon === name.length - 1) return null;
  return {
    userId: name.slice(0, colon),
    conversationId: name.slice(colon + 1),
  };
};

const agentAuth = (userId: string): AuthContext => ({
  isAuthenticated: true,
  userId,
  user: null,
  authMethod: "session",
});

// Resolve a BYOK provider config to an AI SDK model adapter. The `spec`
// determines which wire protocol to speak — Anthropic users hit the
// Anthropic adapter; everyone else (OpenAI, OpenRouter, LiteLLM,
// self-hosted, …) hits the OpenAI-compatible adapter with the supplied
// base URL.
const buildModelFromProvider = (config: Provider.ResolvedConfig): LanguageModel => {
  if (config.spec === "anthropic") {
    return createAnthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model);
  }
  return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model);
};
