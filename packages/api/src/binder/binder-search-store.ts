import { compileFtsQuery, tokenizeQuery } from "../document/processing/fts-query";
import type { BinderSearchHit, BinderSearchInput } from "./tables";

export type { BinderSearchHit, BinderSearchInput } from "./tables";

// Cross-binder lexical search store. Owns reads/writes against
// `binder_chunk_refs` + `binder_chunks_fts`. The `documents` table is read
// only to look up the document `kind` at index time (FK guarantees the row
// exists by the time `indexDocumentChunks` is called from the workflow).
//
// `binder_chunks_fts` is a true contentless FTS5 (`content=''`,
// `contentless_delete=1`). Chunk text is tokenized into the index but never
// stored on the binder side — DocumentDO is the single source of truth for
// chunk text. document_title is intentionally NOT indexed so renames stay
// O(1) (display title still updates via binder_chunk_refs.document_title).
// FK CASCADE on `binder_chunk_refs.document_id` plus the AD trigger keep
// FTS rows in sync on document removal; INSERT is driven explicitly here.
export class BinderSearchStore {
  constructor(private readonly sql: SqlStorage) {}

  // Index a batch of chunks against the cross-binder FTS5 table. Idempotent
  // on (document_id, section_key, chunk_index) so workflow replays UPSERT
  // into the same rows. `kind` is read from `documents.kind` (PRD §9 prose).
  // FTS rows are written explicitly: existing rowids get DELETE+INSERT;
  // new rows get a single INSERT after the ref row exists.
  indexDocumentChunks(input: {
    documentId: string;
    documentTitle: string;
    chunks: Array<{
      sectionKey: string;
      sectionTitle: string | null;
      sectionOrder: number;
      chunkIndex: number;
      startOffset: number;
      endOffset: number;
      textPath: string;
      text: string;
    }>;
  }): void {
    const sql = this.sql;
    const docRows = sql
      .exec<{ kind: string }>(`SELECT kind FROM documents WHERE document_id = ?`, input.documentId)
      .toArray();
    const docRow = docRows[0];
    if (!docRow) {
      throw new Error(
        `BinderSearchStore.indexDocumentChunks: documents row missing for ${input.documentId}`,
      );
    }
    const kind = docRow.kind;
    for (const chunk of input.chunks) {
      const existing = sql
        .exec<{ rowid: number }>(
          `SELECT rowid FROM binder_chunk_refs
           WHERE document_id = ? AND section_key = ? AND chunk_index = ?`,
          input.documentId,
          chunk.sectionKey,
          chunk.chunkIndex,
        )
        .toArray()[0];

      sql.exec(
        `INSERT INTO binder_chunk_refs(
             document_id, document_title, kind, section_key, section_title,
             section_order, chunk_index, start_offset, end_offset, text_path
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(document_id, section_key, chunk_index) DO UPDATE SET
             document_title = excluded.document_title,
             kind = excluded.kind,
             section_title = excluded.section_title,
             section_order = excluded.section_order,
             start_offset = excluded.start_offset,
             end_offset = excluded.end_offset,
             text_path = excluded.text_path`,
        input.documentId,
        input.documentTitle,
        kind,
        chunk.sectionKey,
        chunk.sectionTitle,
        chunk.sectionOrder,
        chunk.chunkIndex,
        chunk.startOffset,
        chunk.endOffset,
        chunk.textPath,
      );

      const rowid =
        existing?.rowid ??
        sql
          .exec<{ rowid: number }>(
            `SELECT rowid FROM binder_chunk_refs
             WHERE document_id = ? AND section_key = ? AND chunk_index = ?`,
            input.documentId,
            chunk.sectionKey,
            chunk.chunkIndex,
          )
          .toArray()[0]?.rowid;
      if (rowid === undefined) continue;

      if (existing) {
        sql.exec(`DELETE FROM binder_chunks_fts WHERE rowid = ?`, rowid);
      }
      sql.exec(
        `INSERT INTO binder_chunks_fts(rowid, section_title, text)
           VALUES (?, ?, ?)`,
        rowid,
        chunk.sectionTitle,
        chunk.text,
      );
    }
  }

  // Cross-binder lexical search. Joins `binder_chunks_fts` to
  // `binder_chunk_refs` so the result carries identifiers + per-chunk
  // metadata. `kind` filter and exclude filters are applied as WHERE
  // predicates on the joined refs table. Returns ranked hits ordered by
  // bm25 ascending (best match first).
  search(input: BinderSearchInput): BinderSearchHit[] {
    const ftsQuery = compileFtsQuery(input.query);
    if (!ftsQuery) return [];
    const limit = input.limit ?? 10;
    const conds: string[] = ["binder_chunks_fts MATCH ?"];
    const args: unknown[] = [ftsQuery];
    if (input.kind !== undefined) {
      conds.push("r.kind = ?");
      args.push(input.kind);
    }
    if (input.excludeDocumentId !== undefined) {
      conds.push("r.document_id != ?");
      args.push(input.excludeDocumentId);
    }
    if (input.excludeSectionKey !== undefined) {
      conds.push("r.section_key != ?");
      args.push(input.excludeSectionKey);
    }
    args.push(limit);

    const rows = this.sql
      .exec<{
        document_id: string;
        document_title: string;
        kind: string;
        section_key: string;
        section_title: string | null;
        chunk_index: number;
        score: number;
      }>(
        `SELECT r.document_id, r.document_title, r.kind, r.section_key,
                r.section_title, r.chunk_index,
                bm25(binder_chunks_fts) AS score
         FROM binder_chunks_fts
         INNER JOIN binder_chunk_refs r ON r.rowid = binder_chunks_fts.rowid
         WHERE ${conds.join(" AND ")}
         ORDER BY bm25(binder_chunks_fts) ASC
         LIMIT ?`,
        ...args,
      )
      .toArray();

    const terms = tokenizeQuery(input.query);
    return rows.map((r) => ({
      documentId: r.document_id,
      documentTitle: r.document_title,
      kind: r.kind,
      sectionKey: r.section_key,
      sectionTitle: r.section_title,
      chunkIndex: r.chunk_index,
      score: r.score,
      terms,
    }));
  }
}
