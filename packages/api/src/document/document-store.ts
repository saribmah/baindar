// Pure SQL implementation of DocumentDO. No `cloudflare:workers` dep so the
// bun-based test runtime can exercise it against an in-memory sqlite shim.
// The DO class (`./document-do.ts`) is a thin wrapper that constructs this
// store with `this.ctx.storage.sql`. See PRD §10.

import { runSqlMigrations } from "../utils/sqlite-migrations";
import { documentMigrations } from "./migrations";
import { compileFtsOrQuery, compileFtsQuery } from "./processing/fts-query";
import type {
  ChunkSnippet,
  DocumentMeta,
  DocumentSearchHit,
  IndexChunksInput,
  InitInput,
  PutSummaryInput,
  SummaryChunk,
  SummaryChunksInput,
  SummaryLookupInput,
  SummaryRow,
} from "./tables";

export type {
  ChunkInput,
  ChunkSnippet,
  DocumentMeta,
  DocumentSearchHit,
  IndexChunksInput,
  InitInput,
  PutSummaryInput,
  SectionInput,
  SummaryChunk,
  SummaryChunksInput,
  SummaryLookupInput,
  SummaryRow,
  SummaryTargetType,
} from "./tables";

export class DocumentStore {
  constructor(private readonly sql: SqlStorage) {
    runSqlMigrations(sql, documentMigrations, "DocumentStore");
  }

  // Initialise (or re-affirm) the document's meta row. Idempotent.
  init(input: InitInput): void {
    const sql = this.sql;
    const upsert = (key: string, value: string) =>
      sql.exec(
        `INSERT INTO document_meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        value,
      );
    upsert("documentId", input.documentId);
    upsert("userId", input.userId);
    upsert("kind", input.kind);
    upsert("manifestKey", input.manifestKey);
    upsert("contentHash", input.contentHash);
  }

  getMeta(): DocumentMeta {
    const rows = this.sql
      .exec<{ key: string; value: string }>(`SELECT key, value FROM document_meta`)
      .toArray();
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.key, r.value);
    return {
      documentId: map.get("documentId") ?? null,
      userId: map.get("userId") ?? null,
      kind: map.get("kind") ?? null,
      manifestKey: map.get("manifestKey") ?? null,
      contentHash: map.get("contentHash") ?? null,
    };
  }

  // UPSERT chunks by (section_key, chunk_index) so workflow step replays
  // don't duplicate. Sections are upserted by section_key. The contentless-
  // looking write to chunks_fts uses an external-content FTS5 table backed
  // by `chunks`, so we explicitly DELETE+INSERT the matching FTS rows by
  // rowid to keep the index consistent under repeated indexChunks calls.
  indexChunks(input: IndexChunksInput): void {
    const sql = this.sql;
    for (const section of input.sections) {
      sql.exec(
        `INSERT INTO sections(section_key, section_order, title, word_count, text_path)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(section_key) DO UPDATE SET
             section_order = excluded.section_order,
             title = excluded.title,
             word_count = excluded.word_count,
             text_path = excluded.text_path`,
        section.sectionKey,
        section.sectionOrder,
        section.title,
        section.wordCount,
        section.textPath,
      );
    }
    for (const chunk of input.chunks) {
      // Look up the existing rowid for FTS sync (so we DELETE the right
      // FTS row before re-inserting).
      const existingRowid = this.sql
        .exec<{ id: number }>(
          `SELECT id FROM chunks WHERE section_key = ? AND chunk_index = ?`,
          chunk.sectionKey,
          chunk.chunkIndex,
        )
        .toArray()[0]?.id;

      sql.exec(
        `INSERT INTO chunks(
             section_key, section_order, section_title, chunk_index,
             start_offset, end_offset, text_path, text
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(section_key, chunk_index) DO UPDATE SET
             section_order = excluded.section_order,
             section_title = excluded.section_title,
             start_offset = excluded.start_offset,
             end_offset = excluded.end_offset,
             text_path = excluded.text_path,
             text = excluded.text`,
        chunk.sectionKey,
        chunk.sectionOrder,
        chunk.sectionTitle,
        chunk.chunkIndex,
        chunk.startOffset,
        chunk.endOffset,
        chunk.textPath,
        chunk.text,
      );

      const newRowid = this.sql
        .exec<{ id: number }>(
          `SELECT id FROM chunks WHERE section_key = ? AND chunk_index = ?`,
          chunk.sectionKey,
          chunk.chunkIndex,
        )
        .toArray()[0]?.id;
      if (newRowid === undefined) continue;

      if (existingRowid !== undefined) {
        sql.exec(`DELETE FROM chunks_fts WHERE rowid = ?`, existingRowid);
      }
      sql.exec(
        `INSERT INTO chunks_fts(rowid, section_title, text) VALUES (?, ?, ?)`,
        newRowid,
        chunk.sectionTitle,
        chunk.text,
      );
    }
  }

  // Returns ordered chunks for a section (or all sections if sectionKey is
  // null), sliced by offset/limit. Used by the AI read tool for offset
  // paging through long sections.
  readSection(input: { sectionKey: string; offset?: number; limit?: number }): {
    sectionKey: string;
    chunks: ChunkSnippet[];
  } {
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 50;
    const rows = this.sql
      .exec<{
        section_key: string;
        section_title: string | null;
        chunk_index: number;
        start_offset: number;
        end_offset: number;
        text: string;
      }>(
        `SELECT section_key, section_title, chunk_index, start_offset, end_offset, text
         FROM chunks
         WHERE section_key = ?
         ORDER BY chunk_index ASC
         LIMIT ? OFFSET ?`,
        input.sectionKey,
        limit,
        offset,
      )
      .toArray();
    return {
      sectionKey: input.sectionKey,
      chunks: rows.map((r) => ({
        sectionKey: r.section_key,
        sectionTitle: r.section_title,
        chunkIndex: r.chunk_index,
        startOffset: r.start_offset,
        endOffset: r.end_offset,
        text: r.text,
      })),
    };
  }

  // When `terms` are supplied, the returned `text` is an FTS5-rendered
  // snippet around the matched terms (highlighted with `<mark>`). Without
  // terms, the full chunk text is returned verbatim. The snippet builds an
  // OR query out of the supplied terms and runs it against `chunks_fts` for
  // the single (section_key, chunk_index) row.
  getChunkSnippet(input: {
    sectionKey: string;
    chunkIndex: number;
    terms?: string[];
  }): ChunkSnippet | null {
    const ftsQuery = input.terms ? compileFtsOrQuery(input.terms) : null;
    if (ftsQuery) {
      const rows = this.sql
        .exec<{
          section_key: string;
          section_title: string | null;
          chunk_index: number;
          start_offset: number;
          end_offset: number;
          snippet: string;
        }>(
          `SELECT c.section_key, c.section_title, c.chunk_index, c.start_offset, c.end_offset,
                  snippet(chunks_fts, 1, '<mark>', '</mark>', '…', 32) AS snippet
           FROM chunks_fts
           INNER JOIN chunks c ON c.id = chunks_fts.rowid
           WHERE chunks_fts MATCH ?
             AND c.section_key = ?
             AND c.chunk_index = ?`,
          ftsQuery,
          input.sectionKey,
          input.chunkIndex,
        )
        .toArray();
      const r = rows[0];
      if (r) {
        return {
          sectionKey: r.section_key,
          sectionTitle: r.section_title,
          chunkIndex: r.chunk_index,
          startOffset: r.start_offset,
          endOffset: r.end_offset,
          text: r.snippet,
        };
      }
      // Fall through to plain text if the chunk didn't match the supplied
      // terms — caller still gets the chunk's text without highlighting.
    }
    const rows = this.sql
      .exec<{
        section_key: string;
        section_title: string | null;
        chunk_index: number;
        start_offset: number;
        end_offset: number;
        text: string;
      }>(
        `SELECT section_key, section_title, chunk_index, start_offset, end_offset, text
         FROM chunks WHERE section_key = ? AND chunk_index = ?`,
        input.sectionKey,
        input.chunkIndex,
      )
      .toArray();
    const r = rows[0];
    if (!r) return null;
    return {
      sectionKey: r.section_key,
      sectionTitle: r.section_title,
      chunkIndex: r.chunk_index,
      startOffset: r.start_offset,
      endOffset: r.end_offset,
      text: r.text,
    };
  }

  // Lexical search over the per-document FTS index. Returns hits ordered by
  // bm25 ascending (best match first); negative bm25 is FTS5's default
  // sort. `query` is the raw user input — callers don't need to know FTS5
  // syntax, the helper sanitises it into a phrase + OR-of-terms expression.
  search(input: { query: string; limit?: number }): DocumentSearchHit[] {
    const ftsQuery = compileFtsQuery(input.query);
    if (!ftsQuery) return [];
    const limit = input.limit ?? 10;
    const rows = this.sql
      .exec<{
        section_key: string;
        section_title: string | null;
        chunk_index: number;
        start_offset: number;
        end_offset: number;
        score: number;
        snippet: string;
      }>(
        `SELECT c.section_key, c.section_title, c.chunk_index, c.start_offset, c.end_offset,
                bm25(chunks_fts) AS score,
                snippet(chunks_fts, 1, '<mark>', '</mark>', '…', 32) AS snippet
         FROM chunks_fts
         INNER JOIN chunks c ON c.id = chunks_fts.rowid
         WHERE chunks_fts MATCH ?
         ORDER BY bm25(chunks_fts) ASC
         LIMIT ?`,
        ftsQuery,
        limit,
      )
      .toArray();
    return rows.map((r) => ({
      sectionKey: r.section_key,
      sectionTitle: r.section_title,
      chunkIndex: r.chunk_index,
      startOffset: r.start_offset,
      endOffset: r.end_offset,
      score: r.score,
      snippet: r.snippet,
    }));
  }

  // ---- Summaries --------------------------------------------------------
  // Lookup the cached summary row for `(targetType, targetKey, contentHash)`.
  // Returns null on miss. Worker-side orchestration generates + persists on
  // miss; this method is read-only.
  getCachedSummary(input: SummaryLookupInput): SummaryRow | null {
    const rows = this.sql
      .exec<{
        target_type: string;
        target_key: string;
        content_hash: string;
        summary: string;
        model: string;
        r2_key: string;
        created_at: number;
      }>(
        `SELECT target_type, target_key, content_hash, summary, model, r2_key, created_at
         FROM summaries
         WHERE target_type = ? AND target_key = ? AND content_hash = ?
         LIMIT 1`,
        input.targetType,
        input.targetKey,
        input.contentHash,
      )
      .toArray();
    const r = rows[0];
    if (!r) return null;
    return {
      targetType: r.target_type === "document" ? "document" : "section",
      targetKey: r.target_key,
      contentHash: r.content_hash,
      summary: r.summary,
      model: r.model,
      r2Key: r.r2_key,
      createdAt: r.created_at,
    };
  }

  // Ordered chunks for the summary target. Section: filter by section_key,
  // ordered by chunk_index. Document: every chunk, ordered by section_order
  // then chunk_index so the LLM sees the document in reading order.
  getSummaryChunks(input: SummaryChunksInput): SummaryChunk[] {
    if (input.targetType === "section") {
      const rows = this.sql
        .exec<{
          section_key: string;
          section_title: string | null;
          section_order: number;
          chunk_index: number;
          text: string;
        }>(
          `SELECT section_key, section_title, section_order, chunk_index, text
           FROM chunks
           WHERE section_key = ?
           ORDER BY chunk_index ASC`,
          input.targetKey,
        )
        .toArray();
      return rows.map(toSummaryChunk);
    }
    const rows = this.sql
      .exec<{
        section_key: string;
        section_title: string | null;
        section_order: number;
        chunk_index: number;
        text: string;
      }>(
        `SELECT section_key, section_title, section_order, chunk_index, text
         FROM chunks
         ORDER BY section_order ASC, chunk_index ASC`,
      )
      .toArray();
    return rows.map(toSummaryChunk);
  }

  // UPSERT by `(target_type, target_key, content_hash)`. `force=true` callers
  // overwrite the summary text/model/r2Key; concurrent first-time generators
  // collapse to the last writer (acceptable v1 tradeoff — see plan §1).
  putSummary(input: PutSummaryInput): void {
    this.sql.exec(
      `INSERT INTO summaries(
         target_type, target_key, content_hash, summary, model, r2_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_type, target_key, content_hash) DO UPDATE SET
         summary = excluded.summary,
         model = excluded.model,
         r2_key = excluded.r2_key,
         created_at = excluded.created_at`,
      input.targetType,
      input.targetKey,
      input.contentHash,
      input.summary,
      input.model,
      input.r2Key,
      input.createdAt,
    );
  }
}

const toSummaryChunk = (r: {
  section_key: string;
  section_title: string | null;
  section_order: number;
  chunk_index: number;
  text: string;
}): SummaryChunk => ({
  sectionKey: r.section_key,
  sectionTitle: r.section_title,
  sectionOrder: r.section_order,
  chunkIndex: r.chunk_index,
  text: r.text,
});
