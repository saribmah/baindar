import type { BinderSearchHit } from "../binder/binder-search-store";
import { DocumentBinding } from "../document/document-binding";

// Fan-out helper for binder search results. `BinderDO.search` returns chunk
// references with `(documentId, sectionKey, chunkIndex, terms)` and a bm25
// score; the snippet itself is rendered by the per-document `DocumentDO`
// because:
//   1. The split keeps BinderDO's FTS5 index purely lexical (PRD §9 spec'd
//      contentless FTS5 for that reason — we shipped external-content for
//      DELETE ergonomics, but the routing stays the same).
//   2. DocumentDO already serves snippets for in-document search and has
//      the full chunk text co-located, so render cost stays per-tenant.
//
// Calls run in parallel via `Promise.all`. Default fan-out is the top-N
// results; callers can shrink (`limit`) but not expand beyond what the
// binder hit array carries. Hits whose DocumentDO snippet returns null
// (e.g. chunk removed mid-flight) are dropped from the output.
//
// `terms` from the BinderSearchHit are forwarded so `DocumentDO.getChunkSnippet`
// can render its FTS5 snippet around the same matched tokens.

export type EnrichedBinderSearchHit = {
  documentId: string;
  documentTitle: string;
  kind: string;
  sectionKey: string;
  sectionTitle: string | null;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  score: number;
  snippet: string;
};

export const fanOutSnippets = async (
  hits: readonly BinderSearchHit[],
  options: { limit?: number } = {},
): Promise<EnrichedBinderSearchHit[]> => {
  const limit = options.limit ?? 5;
  const top = hits.slice(0, Math.max(0, limit));
  if (top.length === 0) return [];

  const results = await Promise.all(
    top.map(async (hit) => {
      const documentDO = DocumentBinding.require(hit.documentId);
      const snippet = await documentDO.getChunkSnippet({
        sectionKey: hit.sectionKey,
        chunkIndex: hit.chunkIndex,
        terms: hit.terms,
      });
      if (!snippet) return null;
      const enriched: EnrichedBinderSearchHit = {
        documentId: hit.documentId,
        documentTitle: hit.documentTitle,
        kind: hit.kind,
        sectionKey: hit.sectionKey,
        // DocumentDO carries authoritative section_title for the chunk; the
        // binder side can fall behind on title updates briefly. Prefer the
        // DocumentDO value, fall back to whatever the binder had.
        sectionTitle: snippet.sectionTitle ?? hit.sectionTitle,
        chunkIndex: hit.chunkIndex,
        startOffset: snippet.startOffset,
        endOffset: snippet.endOffset,
        score: hit.score,
        snippet: snippet.text,
      };
      return enriched;
    }),
  );

  return results.filter((r): r is EnrichedBinderSearchHit => r !== null);
};
