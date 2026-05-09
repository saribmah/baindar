import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import { Instance } from "../instance";
import { NamedError } from "../utils/error";

// Anthropic-backed summary generator. Lives in the worker (not DocumentDO)
// so the DO stays free of the AI SDK and remains unit-testable. The
// orchestrator (`Ai.summarize`) calls this with already-fetched chunk text;
// this module has no knowledge of cache, ownership, or persistence.

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
    targetType: "section" | "document";
    documentTitle: string;
    sectionTitle: string | null;
    chunks: Chunk[];
  };

  export type GenerateResult = {
    summary: string;
    model: string;
  };

  export type Generator = (input: GenerateInput) => Promise<GenerateResult>;

  // Stored summary cap. Production summaries trend ~500-1500 chars; bounding
  // at 4000 keeps the worker→DO RPC payload small and prevents pathological
  // outputs from bloating SQLite.
  const SUMMARY_CHAR_CAP = 4000;

  // Anthropic-backed generator. Reads ANTHROPIC_* from the per-request env
  // (Instance.env), so the test runtime can swap creds without touching the
  // generator itself.
  export const generate: Generator = async (input) => {
    const env = Instance.env;
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LlmCallFailedError({
        kind: "missing_api_key",
        message: "ANTHROPIC_API_KEY is not configured",
      });
    }
    const modelId = env.ANTHROPIC_MODEL;
    const baseURL = env.ANTHROPIC_BASE_URL || undefined;
    const anthropic = createAnthropic({ apiKey, baseURL });
    const prompt = buildPrompt(input);

    let text: string;
    try {
      const result = await generateText({
        model: anthropic(modelId),
        system: SYSTEM_PROMPT,
        prompt,
      });
      text = result.text;
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
    return { summary, model: modelId };
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
