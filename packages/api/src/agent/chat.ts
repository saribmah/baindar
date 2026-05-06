import { createAnthropic } from "@ai-sdk/anthropic";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { RuntimeEnv } from "../app/context";
import { buildAgentTools } from "./tools";

const SYSTEM_PROMPT = `You are Baindar, an AI assistant that helps users navigate and reason about their personal document binder — receipts, invoices, contracts, manuals, books.

You have tools for inspecting the user's binder:
- listDocuments: enumerate uploads (id, title, kind, status, createdAt).
- listNotes: read the user's notes; optionally scope to one document.
- listHighlights: read the user's highlights; optionally scope to one document.

Lean on these before answering specific questions. When the user asks about a document by description ("my lease", "the Apple receipt"), call listDocuments first and match by title. Keep responses concise and grounded; if a tool result doesn't contain the answer, say so plainly rather than guessing.`;

export class ChatAgent extends AIChatAgent<RuntimeEnv> {
  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Response | undefined> {
    const anthropic = createAnthropic({
      apiKey: this.env.ANTHROPIC_API_KEY,
      // Empty string in wrangler.jsonc → fall back to the SDK's default base URL.
      baseURL: this.env.ANTHROPIC_BASE_URL || undefined,
    });
    // Widen to ToolSet so onFinish from AIChatAgent (typed against the abstract
    // ToolSet) lines up with streamText's parameterised callback type.
    const tools: ToolSet = buildAgentTools({ userId: this.name, env: this.env });
    const result = streamText({
      model: anthropic(this.env.ANTHROPIC_MODEL),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
      tools,
      // Allow up to 8 model→tool→model loops per turn so the agent can chain
      // (e.g. listDocuments → match by title → listNotes for that document).
      stopWhen: stepCountIs(8),
      onFinish,
    });
    return result.toUIMessageStreamResponse();
  }
}
