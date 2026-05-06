import { createAnthropic } from "@ai-sdk/anthropic";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import type { RuntimeEnv } from "../app/context";

const SYSTEM_PROMPT =
  "You are Baindar, an AI assistant that helps users navigate and reason about their personal document binder — receipts, invoices, contracts, manuals, books. Keep responses concise and grounded. If you don't have document context yet, say so plainly.";

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
    const result = streamText({
      model: anthropic(this.env.ANTHROPIC_MODEL),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
      onFinish,
    });
    return result.toUIMessageStreamResponse();
  }
}
