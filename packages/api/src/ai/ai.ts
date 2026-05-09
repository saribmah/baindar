import { z } from "zod";
import { Binder } from "../binder/binder";
import { DocumentBinding } from "../document/document-binding";
import { Document } from "../document/document";
import { NamedError } from "../utils/error";
import { fanOutSnippets, type EnrichedBinderSearchHit } from "./search-snippets";

// Typed AI search/read/summary surface. Mirrors PRD §13's `/ai/*` routes;
// the route layer parses HTTP, validates with the schemas exported here,
// and forwards to these feature functions.
//
// Search dispatch:
//   - `documentId` set      → DocumentDO.search (in-document hits + snippets)
//   - `documentId` omitted  → BinderDO.search + parallel fan-out to
//                             DocumentDO.getChunkSnippet for snippet text
//
// `summarize` is a stub that throws `NotImplementedError`; the route maps it
// to a 501. Phase 6 wires the lazy-summary path.
export namespace Ai {
  // ---- Errors -----------------------------------------------------------
  export const NotImplementedError = NamedError.create(
    "AiNotImplementedError",
    z.object({ feature: z.string(), message: z.string().optional() }),
  );
  export type NotImplementedError = InstanceType<typeof NotImplementedError>;

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

  // ---- Summarize (stub) -------------------------------------------------
  // Phase 6 wires DocumentDO.getOrGenerateSummary; until then the route
  // returns 501.
  export const SummarizeTargetType = z.enum(["section", "document"]);
  export type SummarizeTargetType = z.infer<typeof SummarizeTargetType>;

  export const SummarizeInput = z
    .object({
      documentId: z.string().min(1),
      targetType: SummarizeTargetType,
      targetKey: z.string().min(1).max(200),
      force: z.boolean().optional(),
    })
    .meta({ ref: "AiSummarizeInput" });
  export type SummarizeInput = z.infer<typeof SummarizeInput>;

  export const summarize = async (_userId: string, _input: SummarizeInput): Promise<never> => {
    throw new NotImplementedError({
      feature: "summarize",
      message: "Summary generation is not yet available",
    });
  };
}
