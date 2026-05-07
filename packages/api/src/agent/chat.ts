import { createAnthropic } from "@ai-sdk/anthropic";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { AuthContext, RuntimeEnv } from "../app/context";
import { Conversation } from "../conversation/conversation";
import { createDb, type Db } from "../db/db";
import { Instance } from "../instance";
import {
  referenceDataPartToModelPart,
  validateReferenceDataParts,
  type BaindarAgentMessage,
} from "./message-reference";
import { SYSTEM_PROMPT } from "./prompt";
import { buildAgentTools } from "./tools";

export class ChatAgent extends AIChatAgent<RuntimeEnv> {
  // Cached after the first D1 lookup. The DO's instance name is the
  // conversationId; the userId is whoever owns that conversation row.
  // Stable for the lifetime of the DO instance — the conversation can't
  // change owners, and the DO is deleted when the conversation is.
  private cachedUserId: string | null = null;

  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Response | undefined> {
    const db = createDb(this.env);
    const userId = await this.resolveUserId(db);
    if (!userId) {
      // The auth middleware blocks unauthorized callers from reaching the
      // DO, so a missing row here implies the conversation was deleted
      // mid-request. Bail without persisting a turn.
      return new Response("Conversation not found", { status: 404 });
    }

    return Instance.provide({ auth: agentAuth(userId), env: this.env, db }, async () => {
      const conversationId = this.name;
      const messages = this.messages as BaindarAgentMessage[];
      const referenceValidation = validateReferenceDataParts(messages);
      if (!referenceValidation.ok) {
        return new Response(referenceValidation.message, { status: 400 });
      }

      // Bump last_activity_at so the sidebar reorders. Silent no-op if the
      // row vanished mid-turn.
      await Conversation.touch(userId, conversationId).catch(() => {});

      const anthropic = createAnthropic({
        apiKey: this.env.ANTHROPIC_API_KEY,
        baseURL: this.env.ANTHROPIC_BASE_URL || undefined,
      });
      const tools: ToolSet = buildAgentTools({ userId });
      const result = streamText({
        model: anthropic(this.env.ANTHROPIC_MODEL),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(messages, {
          convertDataPart: referenceDataPartToModelPart,
        }),
        abortSignal: options?.abortSignal,
        tools,
        // Allow up to 8 model→tool→model loops per turn so the agent can chain
        // (e.g. listDocuments → match by title → listNotes for that document).
        stopWhen: stepCountIs(8),
        onFinish,
      });
      return result.toUIMessageStreamResponse();
    });
  }

  private async resolveUserId(db: Db): Promise<string | null> {
    if (this.cachedUserId) return this.cachedUserId;
    const userId = await Instance.provide({ auth: anonymousAuth, env: this.env, db }, () =>
      Conversation.ownerOf(this.name),
    );
    if (userId) this.cachedUserId = userId;
    return userId;
  }
}

const anonymousAuth: AuthContext = {
  isAuthenticated: false,
  userId: null,
  user: null,
  authMethod: null,
};

const agentAuth = (userId: string): AuthContext => ({
  isAuthenticated: true,
  userId,
  user: null,
  authMethod: "session",
});
