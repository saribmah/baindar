import { z } from "zod";
import { Binder } from "../binder/binder";
import { DocumentAssetStore } from "../document/asset-store";
import { DocumentBinding } from "../document/document-binding";
import { Document } from "../document/document";
import { NamedError } from "../utils/error";
import { fanOutSnippets, type EnrichedBinderSearchHit } from "./search-snippets";
import { SummaryGenerator } from "./summary-generator";

// Typed AI search/read/summary surface. Mirrors PRD §13's `/ai/*` routes;
// the route layer parses HTTP, validates with the schemas exported here,
// and forwards to these feature functions.
//
// Search dispatch:
//   - `documentId` set      → DocumentDO.search (in-document hits + snippets)
//   - `documentId` omitted  → BinderDO.search + parallel fan-out to
//                             DocumentDO.getChunkSnippet for snippet text
//
// Summary orchestration (Phase 6) lives in the worker, not DocumentDO:
//   1. ownership check via `Document.get`
//   2. cache lookup against `DocumentDO.getCachedSummary`
//   3. on miss, fetch chunks via `DocumentDO.getSummaryChunks`
//   4. call the LLM via `SummaryGenerator.generate`
//   5. write JSON artifact to R2, persist row in DocumentDO
//
// Re-exporting `LlmCallFailedError` here so route mappers and tools can
// match against `Ai.LlmCallFailedError` without crossing module boundaries.
export namespace Ai {
  // ---- Errors -----------------------------------------------------------
  export const SummaryEmptyError = NamedError.create(
    "AiSummaryEmptyError",
    z.object({
      documentId: z.string(),
      targetType: z.enum(["section", "document"]),
      targetKey: z.string(),
      message: z.string().optional(),
    }),
  );
  export type SummaryEmptyError = InstanceType<typeof SummaryEmptyError>;

  export const SummaryTargetMismatchError = NamedError.create(
    "AiSummaryTargetMismatchError",
    z.object({
      documentId: z.string(),
      targetKey: z.string(),
      message: z.string().optional(),
    }),
  );
  export type SummaryTargetMismatchError = InstanceType<typeof SummaryTargetMismatchError>;

  export const LlmCallFailedError = SummaryGenerator.LlmCallFailedError;
  export type LlmCallFailedError = SummaryGenerator.LlmCallFailedError;

  // ---- Search -----------------------------------------------------------
  // Limits: keep search results bounded so the model context stays sane.
  // 50 is a hard ceiling; default 10 matches PRD §9 prose ("default 5–10").
  const SEARCH_LIMIT_MAX = 50;
  const SEARCH_LIMIT_DEFAULT = 10;

  export const SearchInput = z
    .object({
      query: z.string().trim().min(1).max(500),
      documentId: z.string().min(1).optional(),
      kind: z.string().min(1).max(64).optional(),
      excludeDocumentId: z.string().min(1).optional(),
      excludeSectionKey: z.string().min(1).max(200).optional(),
      limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
    })
    .meta({ ref: "AiSearchInput" });
  export type SearchInput = z.infer<typeof SearchInput>;

  export const SearchHit = z
    .object({
      documentId: z.string(),
      documentTitle: z.string(),
      kind: z.string(),
      sectionKey: z.string(),
      sectionTitle: z.string().nullable(),
      chunkIndex: z.number().int().nonnegative(),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
      score: z.number(),
      snippet: z.string(),
    })
    .meta({ ref: "AiSearchHit" });
  export type SearchHit = z.infer<typeof SearchHit>;

  export const SearchResponse = z.object({ items: z.array(SearchHit) });
  export type SearchResponse = z.infer<typeof SearchResponse>;

  export const search = async (userId: string, input: SearchInput): Promise<SearchHit[]> => {
    const limit = input.limit ?? SEARCH_LIMIT_DEFAULT;

    if (input.documentId !== undefined) {
      // In-document search. Confirm ownership via Document.get so the route
      // surfaces DocumentNotFoundError on cross-user / missing rows.
      const doc = await Document.get(userId, input.documentId);
      const documentDO = DocumentBinding.require(input.documentId);
      const hits = await documentDO.search({ query: input.query, limit });
      return hits.map((h) => ({
        documentId: doc.id,
        documentTitle: doc.title,
        kind: doc.kind,
        sectionKey: h.sectionKey,
        sectionTitle: h.sectionTitle,
        chunkIndex: h.chunkIndex,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        score: h.score,
        snippet: h.snippet,
      }));
    }

    // Cross-binder search: rank in BinderDO, render snippets in DocumentDO.
    const binder = Binder.require(userId);
    const refs = await binder.search({
      query: input.query,
      limit,
      kind: input.kind,
      excludeDocumentId: input.excludeDocumentId,
      excludeSectionKey: input.excludeSectionKey,
    });
    const enriched = await fanOutSnippets(refs, { limit });
    return enriched.map(toSearchHit);
  };

  const toSearchHit = (h: EnrichedBinderSearchHit): SearchHit => ({
    documentId: h.documentId,
    documentTitle: h.documentTitle,
    kind: h.kind,
    sectionKey: h.sectionKey,
    sectionTitle: h.sectionTitle,
    chunkIndex: h.chunkIndex,
    startOffset: h.startOffset,
    endOffset: h.endOffset,
    score: h.score,
    snippet: h.snippet,
  });

  // ---- Read -------------------------------------------------------------
  // Page through a section's chunks. Used by the `read_section` AI tool;
  // routes call `Ai.read` after validating the input schema. `offset` is a
  // chunk-index offset (not byte offset); `limit` caps how many chunks come
  // back so the model context budget is bounded.
  const READ_LIMIT_MAX = 50;
  const READ_LIMIT_DEFAULT = 10;

  export const ReadInput = z
    .object({
      documentId: z.string().min(1),
      sectionKey: z.string().min(1).max(200),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().min(1).max(READ_LIMIT_MAX).optional(),
    })
    .meta({ ref: "AiReadInput" });
  export type ReadInput = z.infer<typeof ReadInput>;

  export const ReadChunk = z
    .object({
      sectionKey: z.string(),
      sectionTitle: z.string().nullable(),
      chunkIndex: z.number().int().nonnegative(),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
      text: z.string(),
    })
    .meta({ ref: "AiReadChunk" });
  export type ReadChunk = z.infer<typeof ReadChunk>;

  export const ReadResponse = z
    .object({
      documentId: z.string(),
      sectionKey: z.string(),
      chunks: z.array(ReadChunk),
    })
    .meta({ ref: "AiReadResponse" });
  export type ReadResponse = z.infer<typeof ReadResponse>;

  export const read = async (userId: string, input: ReadInput): Promise<ReadResponse> => {
    // Ownership check via Document.get — cross-user reads surface as
    // DocumentNotFoundError.
    await Document.get(userId, input.documentId);
    const documentDO = DocumentBinding.require(input.documentId);
    const result = await documentDO.readSection({
      sectionKey: input.sectionKey,
      offset: input.offset,
      limit: input.limit ?? READ_LIMIT_DEFAULT,
    });
    return {
      documentId: input.documentId,
      sectionKey: result.sectionKey,
      chunks: result.chunks.map((c) => ({
        sectionKey: c.sectionKey,
        sectionTitle: c.sectionTitle,
        chunkIndex: c.chunkIndex,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        text: c.text,
      })),
    };
  };

  // ---- Summarize --------------------------------------------------------
  export const SummarizeTargetType = z.enum(["section", "document"]);
  export type SummarizeTargetType = z.infer<typeof SummarizeTargetType>;

  export const SummarizeInput = z
    .object({
      documentId: z.string().min(1),
      targetType: SummarizeTargetType,
      targetKey: z.string().min(1).max(200),
      // When true, bypass the cache and regenerate. The fresh row UPSERTs
      // over the cached one. Useful when the caller suspects a stale or
      // truncated summary; routine reads should leave this unset.
      force: z.boolean().optional(),
    })
    .meta({ ref: "AiSummarizeInput" });
  export type SummarizeInput = z.infer<typeof SummarizeInput>;

  export const SummarizeResponse = z
    .object({
      documentId: z.string(),
      targetType: SummarizeTargetType,
      targetKey: z.string(),
      contentHash: z.string(),
      summary: z.string(),
      model: z.string(),
      cached: z.boolean(),
      createdAt: z.string(),
    })
    .meta({ ref: "AiSummarizeResponse" });
  export type SummarizeResponse = z.infer<typeof SummarizeResponse>;

  // Worker-side orchestrator. The DocumentDO exposes cache/read/persist
  // primitives; LLM dispatch happens here so the DO stays free of the AI
  // SDK. `generator` is injectable for tests.
  export const summarize = async (
    userId: string,
    input: SummarizeInput,
    deps: { generator?: SummaryGenerator.Generator } = {},
  ): Promise<SummarizeResponse> => {
    // Ownership check. Throws `Document.NotFoundError` for cross-user /
    // missing rows. The returned entity carries `sha256` (== contentHash on
    // the DocumentDO meta) and `status`, so we don't need a separate
    // DocumentDO.getMeta() roundtrip.
    const doc = await Document.get(userId, input.documentId);
    if (doc.status !== "processed") {
      throw new Document.NotProcessedError({ id: doc.id, status: doc.status });
    }
    if (input.targetType === "document" && input.targetKey !== doc.id) {
      throw new SummaryTargetMismatchError({
        documentId: doc.id,
        targetKey: input.targetKey,
        message: "targetKey must equal documentId for target_type='document'",
      });
    }

    const documentDO = DocumentBinding.require(doc.id);
    const lookup = {
      targetType: input.targetType,
      targetKey: input.targetKey,
      contentHash: doc.sha256,
    };

    if (input.force !== true) {
      const cached = await documentDO.getCachedSummary(lookup);
      if (cached) {
        return toResponse(doc.id, cached, true);
      }
    }

    const chunks = await documentDO.getSummaryChunks({
      targetType: input.targetType,
      targetKey: input.targetKey,
    });
    if (chunks.length === 0) {
      throw new SummaryEmptyError({
        documentId: doc.id,
        targetType: input.targetType,
        targetKey: input.targetKey,
        message:
          input.targetType === "section"
            ? "No indexed chunks for this section"
            : "Document has no indexed chunks",
      });
    }

    const sectionTitle =
      input.targetType === "section"
        ? (chunks.find((c) => c.sectionTitle !== null)?.sectionTitle ?? null)
        : null;

    const generator = deps.generator ?? SummaryGenerator.generate;
    const { summary, model } = await generator({
      targetType: input.targetType,
      documentTitle: doc.title,
      sectionTitle,
      chunks,
    });

    const r2Name = summaryR2Name(input.targetType, input.targetKey, doc.sha256);
    const createdAt = Date.now();
    const r2Key = await DocumentAssetStore.putAiSummary(
      userId,
      doc.id,
      r2Name,
      JSON.stringify({
        documentId: doc.id,
        targetType: input.targetType,
        targetKey: input.targetKey,
        contentHash: doc.sha256,
        summary,
        model,
        createdAt: new Date(createdAt).toISOString(),
      }),
    );

    const row = {
      targetType: input.targetType,
      targetKey: input.targetKey,
      contentHash: doc.sha256,
      summary,
      model,
      r2Key,
      createdAt,
    };
    await documentDO.putSummary(row);
    return toResponse(doc.id, row, false);
  };

  const toResponse = (
    documentId: string,
    row: {
      targetType: SummarizeTargetType;
      targetKey: string;
      contentHash: string;
      summary: string;
      model: string;
      createdAt: number;
    },
    cached: boolean,
  ): SummarizeResponse => ({
    documentId,
    targetType: row.targetType,
    targetKey: row.targetKey,
    contentHash: row.contentHash,
    summary: row.summary,
    model: row.model,
    cached,
    createdAt: new Date(row.createdAt).toISOString(),
  });

  // R2 filename layout. `document-{contentHash}.json` for whole-document
  // summaries (targetKey == documentId, redundant in the filename); section
  // summaries include a slugged sectionKey since multiple sections of the
  // same document share `contentHash` but need distinct objects.
  const summaryR2Name = (
    targetType: SummarizeTargetType,
    targetKey: string,
    contentHash: string,
  ): string => {
    if (targetType === "document") {
      return `document-${contentHash}.json`;
    }
    return `section-${contentHash}-${slugTargetKey(targetKey)}.json`;
  };

  const slugTargetKey = (key: string): string => key.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
