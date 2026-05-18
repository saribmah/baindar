import { generateText } from "ai";
import { z } from "zod";
import { Config } from "../config/config";
import { Provider } from "../provider/provider";
import { NamedError } from "../utils/error";

// LLM-backed summary generator. Lives in the worker (not DocumentDO) so
// the DO stays free of the AI SDK and remains unit-testable. The
// orchestrator (`Ai.summarize`) calls this with already-fetched chunk text;
// this module has no knowledge of cache, ownership, or persistence. Model
// resolution goes through `Provider.getLanguageModel(userId)` so BYOK
// users transparently bill against their own key.

export namespace SummaryGenerator {
  // Anthropic call failed (network, auth, model unavailable, content too
  // long, …). Mapped to 502 by the route. Carries `kind` so logs can
  // distinguish missing-config from genuine LLM errors without parsing the
  // upstream message.
  export const LlmCallFailedError = NamedError.create(
    "AiLlmCallFailedError",
    z.object({
      kind: z.enum(["missing_api_key", "model_error", "unknown"]),
      cause: z.string().optional(),
      message: z.string().optional(),
    }),
  );
  export type LlmCallFailedError = InstanceType<typeof LlmCallFailedError>;

  export type Chunk = {
    sectionKey: string;
    sectionTitle: string | null;
    sectionOrder: number;
    chunkIndex: number;
    text: string;
  };

  export type GenerateInput = {
    userId: string;
    targetType: "section" | "document";
    documentTitle: string;
    sectionTitle: string | null;
    chunks: Chunk[];
  };

  export type GenerateResult = {
    summary: string;
    model: string;
    // True when the call ran against the user's BYOK provider — propagated
    // up to `Billing.recordUsage` so the ledger row is tagged correctly.
    byok: boolean;
    // Token usage from the underlying LLM call. Surfaced so the billing
    // layer can meter cost without re-tokenizing the prompt. Defaults to
    // zero when the SDK returns no usage (test stubs, model errors that
    // still produced output).
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
  };

  export type Generator = (input: GenerateInput) => Promise<GenerateResult>;

  // Stored summary cap. Production summaries trend ~500-1500 chars; bounding
  // at 4000 keeps the worker→DO RPC payload small and prevents pathological
  // outputs from bloating SQLite.
  const SUMMARY_CHAR_CAP = 4000;

  // BYOK-first generator. Delegates model resolution to
  // `Provider.getLanguageModel`, so platform/BYOK selection is identical
  // to the chat path. Missing platform credentials surface as the
  // existing `missing_api_key` LLM error so the route mapping doesn't
  // change.
  export const generate: Generator = async (input) => {
    let resolved: Awaited<ReturnType<typeof Provider.getLanguageModel>>;
    try {
      resolved = await Provider.getLanguageModel(input.userId);
    } catch (e) {
      if (Config.PlatformLlmNotConfiguredError.isInstance(e)) {
        throw new LlmCallFailedError({
          kind: "missing_api_key",
          message: "Platform LLM credentials are not configured",
        });
      }
      throw e;
    }
    const prompt = buildPrompt(input);

    let text: string;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const result = await generateText({
        model: resolved.model,
        system: SYSTEM_PROMPT,
        prompt,
      });
      text = result.text;
      inputTokens = result.usage?.inputTokens ?? 0;
      outputTokens = result.usage?.outputTokens ?? 0;
    } catch (e) {
      throw new LlmCallFailedError({
        kind: "model_error",
        cause: (e as Error).message,
      });
    }

    const summary = text.trim().slice(0, SUMMARY_CHAR_CAP);
    if (summary.length === 0) {
      throw new LlmCallFailedError({
        kind: "model_error",
        message: "LLM returned an empty summary",
      });
    }
    return {
      summary,
      model: resolved.modelId,
      byok: resolved.byok,
      usage: { inputTokens, outputTokens },
    };
  };

  const SYSTEM_PROMPT = [
    "You are a precise summarizer for a personal document binder.",
    "Produce a concise summary of the supplied passage in plain prose (no headings, no lists).",
    "Stay faithful to the source: do not introduce facts that are not in the text.",
    "Prefer 4–8 sentences for sections, and 8–14 for whole documents.",
    "If the passage is incoherent or empty, say so in one sentence.",
  ].join(" ");

  // Build the user prompt from the chunks. Document-level keeps section
  // breaks visible so the model can chunk its summary by section internally.
  // Section-level concatenates without breaks.
  const buildPrompt = (input: GenerateInput): string => {
    const header =
      input.targetType === "section"
        ? `Summarize the following section${input.sectionTitle ? ` ("${input.sectionTitle}")` : ""} from "${input.documentTitle}":`
        : `Summarize the following document titled "${input.documentTitle}":`;

    if (input.targetType === "section") {
      const body = input.chunks.map((c) => c.text).join("\n\n");
      return `${header}\n\n${body}`;
    }

    // Document-level: group chunks by section so the model can see structure.
    const sections = new Map<string, { title: string | null; order: number; text: string[] }>();
    for (const c of input.chunks) {
      const existing = sections.get(c.sectionKey);
      if (existing) {
        existing.text.push(c.text);
      } else {
        sections.set(c.sectionKey, {
          title: c.sectionTitle,
          order: c.sectionOrder,
          text: [c.text],
        });
      }
    }
    const ordered = [...sections.values()].sort((a, b) => a.order - b.order);
    const body = ordered
      .map((s, idx) => {
        const heading = s.title ?? `Section ${idx + 1}`;
        return `## ${heading}\n${s.text.join("\n\n")}`;
      })
      .join("\n\n");
    return `${header}\n\n${body}`;
  };
}
