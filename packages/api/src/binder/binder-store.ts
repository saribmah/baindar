// Pure SQL implementation of BinderDO. Has no `cloudflare:workers` dep so
// the bun-based test runtime can exercise it against an in-memory sqlite
// shim. The DO class (`./binder-do.ts`) is a thin wrapper that constructs
// this store with `this.ctx.storage.sql`.

import { compileFtsQuery, tokenizeQuery } from "../document/document-store";

type Migration = {
  readonly id: number;
  readonly sql: string;
};

// Append-only. New migrations get a new monotonically-increasing id.
// Editing an existing entry will diverge from already-applied DOs in the
// wild — always add a new row instead.
//
// `binder_chunks_fts` uses external-content FTS5 (`content='binder_chunk_refs'`)
// instead of the PRD's contentless mode (PRD §9). Contentless FTS5's DELETE
// command requires re-supplying every original column value, which would
// force a DocumentDO round-trip on every removeDocument call. External
// content keeps text once in `binder_chunk_refs.text`, lets standard SQL
// UPSERT/DELETE drive index changes, and keeps storage cost bounded. Pure
// contentless can be revisited if BinderDO size ever bottlenecks (PRD §18
// open question 1).
const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE documents (
        document_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        sensitive INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error_reason TEXT,
        cover_image TEXT,
        source_url TEXT,
        original_key TEXT NOT NULL,
        manifest_key TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_documents_updated_at ON documents(updated_at);
      CREATE INDEX idx_documents_status ON documents(status);

      CREATE TABLE shelves (
        shelf_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        position REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_shelves_name_lower ON shelves(lower(name));

      CREATE TABLE shelf_documents (
        shelf_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        position REAL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (shelf_id, document_id)
      );
      CREATE INDEX idx_shelf_documents_document ON shelf_documents(document_id);

      CREATE TABLE progress (
        document_id TEXT PRIMARY KEY,
        section_key TEXT NOT NULL,
        position_json TEXT,
        progress_percent REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_progress_updated_at ON progress(updated_at);

      CREATE TABLE highlights (
        highlight_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        section_key TEXT NOT NULL,
        position_json TEXT NOT NULL,
        text_snippet TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_highlights_document_section ON highlights(document_id, section_key);
      CREATE INDEX idx_highlights_created_at ON highlights(created_at);

      CREATE TABLE notes (
        note_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        section_key TEXT,
        highlight_id TEXT,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_notes_document_section ON notes(document_id, section_key);
      CREATE INDEX idx_notes_highlight ON notes(highlight_id);
      CREATE INDEX idx_notes_created_at ON notes(created_at);

      CREATE TABLE conversations (
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        primary_document_id TEXT,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL
      );
      CREATE INDEX idx_conversations_activity ON conversations(last_activity_at);

      -- Cross-binder chunk references + tokenizable text. PRD §9 specs a
      -- contentless FTS5 (content=''), but contentless FTS5 DELETE/UPDATE
      -- semantics require the caller to surface the full original column
      -- values for every removal -- unworkable for removeDocument without
      -- a round-trip back to DocumentDO. Use external-content FTS5 instead:
      -- text lives once in binder_chunk_refs.text and the FTS index is
      -- kept in sync via triggers. Trades modest BinderDO storage growth
      -- for clean UPSERT/DELETE behavior. Pure contentless can revisit
      -- if BinderDO size becomes a bottleneck (PRD §18 open question 1).
      CREATE TABLE binder_chunk_refs (
        rowid INTEGER PRIMARY KEY,
        document_id TEXT NOT NULL,
        document_title TEXT NOT NULL,
        kind TEXT NOT NULL,
        section_key TEXT NOT NULL,
        section_title TEXT,
        section_order INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        text_path TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX idx_binder_chunk_refs_document ON binder_chunk_refs(document_id);
      CREATE INDEX idx_binder_chunk_refs_kind ON binder_chunk_refs(kind);
      CREATE UNIQUE INDEX idx_binder_chunk_refs_unique
        ON binder_chunk_refs(document_id, section_key, chunk_index);

      CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
        document_title,
        section_title,
        text,
        content='binder_chunk_refs',
        content_rowid='rowid',
        tokenize='porter unicode61 remove_diacritics 2'
      );

      -- Standard FTS5 external-content sync triggers.
      CREATE TRIGGER binder_chunk_refs_ai AFTER INSERT ON binder_chunk_refs BEGIN
        INSERT INTO binder_chunks_fts(rowid, document_title, section_title, text)
        VALUES (new.rowid, new.document_title, new.section_title, new.text);
      END;
      CREATE TRIGGER binder_chunk_refs_ad AFTER DELETE ON binder_chunk_refs BEGIN
        INSERT INTO binder_chunks_fts(binder_chunks_fts, rowid, document_title, section_title, text)
        VALUES ('delete', old.rowid, old.document_title, old.section_title, old.text);
      END;
      CREATE TRIGGER binder_chunk_refs_au AFTER UPDATE ON binder_chunk_refs BEGIN
        INSERT INTO binder_chunks_fts(binder_chunks_fts, rowid, document_title, section_title, text)
        VALUES ('delete', old.rowid, old.document_title, old.section_title, old.text);
        INSERT INTO binder_chunks_fts(rowid, document_title, section_title, text)
        VALUES (new.rowid, new.document_title, new.section_title, new.text);
      END;

      CREATE TABLE ai_session (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

export type DocumentRow = {
  documentId: string;
  kind: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  contentHash: string;
  title: string;
  sensitive: boolean;
  status: string;
  errorReason: string | null;
  coverImage: string | null;
  sourceUrl: string | null;
  originalKey: string;
  manifestKey: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateDocumentInput = {
  documentId: string;
  kind: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  contentHash: string;
  title: string;
  sensitive: boolean;
  status: string;
  originalKey: string;
};

export type UpdateDocumentInput = {
  documentId: string;
  title?: string;
};

export type MarkDocumentProcessedInput = {
  documentId: string;
  title: string | null;
  coverImage: string | null;
  manifestKey?: string | null;
};

// Position payloads transit DO RPC, so they must be a concrete
// serializable shape. Format-specific position types (e.g. `{offsetStart,
// offsetEnd}` for highlights, `{offset}` for progress) all reduce to a
// numeric record at the wire level. Storage callers narrow to the
// format-specific type.
export type PositionPayload = Record<string, number>;

export type ProgressInput = {
  documentId: string;
  sectionKey: string;
  position: PositionPayload | null;
  progressPercent: number | null;
};

export type ProgressRow = {
  documentId: string;
  sectionKey: string;
  position: PositionPayload | null;
  progressPercent: number | null;
  createdAt: number;
  updatedAt: number;
};

export type HighlightCreateInput = {
  highlightId: string;
  documentId: string;
  sectionKey: string;
  position: PositionPayload;
  textSnippet: string;
  color: string;
};

export type HighlightRow = {
  highlightId: string;
  documentId: string;
  sectionKey: string;
  position: PositionPayload;
  textSnippet: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

export type NoteCreateInput = {
  noteId: string;
  documentId: string;
  sectionKey: string | null;
  highlightId: string | null;
  body: string;
};

export type NoteRow = {
  noteId: string;
  documentId: string;
  sectionKey: string | null;
  highlightId: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type ShelfCreateInput = {
  shelfId: string;
  name: string;
  description: string | null;
};

export type ShelfRow = {
  shelfId: string;
  name: string;
  description: string | null;
  position: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ShelfRowWithCount = ShelfRow & { itemCount: number };

export type DocumentWithProgressRow = DocumentRow & {
  progress: {
    sectionKey: string;
    progressPercent: number | null;
    updatedAt: number;
  } | null;
};

// Single ranked hit from `BinderStore.search`. Carries enough to fan out to
// `DocumentDO.getChunkSnippet` for snippet rendering. `score` is FTS5's raw
// bm25 (smaller = better-ranked). `terms` are the user-supplied search terms
// the snippet helper passes back into DocumentDO so its snippet() call uses
// the same matched-token set. Only `documentTitle` and `kind` come from the
// binder's own row data (not the FTS index).
export type BinderSearchHit = {
  documentId: string;
  documentTitle: string;
  kind: string;
  sectionKey: string;
  sectionTitle: string | null;
  chunkIndex: number;
  score: number;
  terms: string[];
};

export type BinderSearchInput = {
  query: string;
  limit?: number;
  kind?: string;
  excludeDocumentId?: string;
  excludeSectionKey?: string;
};

export type ConversationCreateInput = {
  conversationId: string;
  title: string;
  primaryDocumentId: string | null;
};

export type ConversationRow = {
  conversationId: string;
  title: string;
  primaryDocumentId: string | null;
  createdAt: number;
  lastActivityAt: number;
};

export type ConversationUpdateInput = {
  conversationId: string;
  title?: string;
};

export class BinderStore {
  constructor(private readonly sql: SqlStorage) {
    this.#runMigrations();
  }

  createDocument(input: CreateDocumentInput): DocumentRow {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO documents(
        document_id, kind, mime_type, original_filename, size_bytes,
        content_hash, title, sensitive, status, error_reason,
        cover_image, source_url, original_key, manifest_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
      input.documentId,
      input.kind,
      input.mimeType,
      input.originalFilename,
      input.sizeBytes,
      input.contentHash,
      input.title,
      input.sensitive ? 1 : 0,
      input.status,
      input.originalKey,
      now,
      now,
    );
    const row = this.#getDocumentRow(input.documentId);
    if (!row) throw new Error(`Document insert disappeared: ${input.documentId}`);
    return row;
  }

  getDocument(documentId: string): DocumentRow | null {
    return this.#getDocumentRow(documentId);
  }

  listDocuments(): DocumentRow[] {
    const rows = this.sql
      .exec<DocumentRowSql>(`SELECT * FROM documents ORDER BY created_at DESC`)
      .toArray();
    return rows.map(rowToDocument);
  }

  updateDocument(input: UpdateDocumentInput): DocumentRow | null {
    const existing = this.#getDocumentRow(input.documentId);
    if (!existing) return null;
    const now = Date.now();
    if (typeof input.title === "string") {
      const sql = this.sql;
      sql.exec("BEGIN");
      try {
        sql.exec(
          `UPDATE documents SET title = ?, updated_at = ? WHERE document_id = ?`,
          input.title,
          now,
          input.documentId,
        );
        sql.exec(
          `UPDATE binder_chunk_refs SET document_title = ? WHERE document_id = ?`,
          input.title,
          input.documentId,
        );
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    }
    return this.#getDocumentRow(input.documentId);
  }

  markDocumentProcessed(input: MarkDocumentProcessedInput): void {
    const existing = this.#getDocumentRow(input.documentId);
    if (!existing) return;
    const now = Date.now();
    const title = input.title ?? existing.title;
    const manifestKey = input.manifestKey === undefined ? existing.manifestKey : input.manifestKey;
    this.sql.exec(
      `UPDATE documents
       SET status = 'processed',
           error_reason = NULL,
           title = ?,
           cover_image = ?,
           manifest_key = ?,
           updated_at = ?
       WHERE document_id = ?`,
      title,
      input.coverImage,
      manifestKey,
      now,
      input.documentId,
    );
  }

  markDocumentFailed(input: { documentId: string; reason: string }): void {
    const existing = this.#getDocumentRow(input.documentId);
    if (!existing) return;
    const now = Date.now();
    this.sql.exec(
      `UPDATE documents
       SET status = 'failed', error_reason = ?, updated_at = ?
       WHERE document_id = ?`,
      input.reason,
      now,
      input.documentId,
    );
  }

  // Index a batch of chunks against the cross-binder FTS5 table. Idempotent
  // on (document_id, section_key, chunk_index) so workflow replays UPSERT
  // into the same rows. `kind` is read from `documents.kind` (PRD §9 prose).
  // FTS sync is handled automatically by triggers on `binder_chunk_refs`.
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
    const docRow = this.#getDocumentRow(input.documentId);
    if (!docRow) {
      throw new Error(
        `BinderStore.indexDocumentChunks: documents row missing for ${input.documentId}`,
      );
    }
    const kind = docRow.kind;
    sql.exec("BEGIN");
    try {
      for (const chunk of input.chunks) {
        sql.exec(
          `INSERT INTO binder_chunk_refs(
             document_id, document_title, kind, section_key, section_title,
             section_order, chunk_index, start_offset, end_offset, text_path, text
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(document_id, section_key, chunk_index) DO UPDATE SET
             document_title = excluded.document_title,
             kind = excluded.kind,
             section_title = excluded.section_title,
             section_order = excluded.section_order,
             start_offset = excluded.start_offset,
             end_offset = excluded.end_offset,
             text_path = excluded.text_path,
             text = excluded.text`,
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
          chunk.text,
        );
      }
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
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

  // Idempotent single-transaction cleanup. Safe under DocumentDeletionWorkflow
  // step replays — re-running against an already-deleted doc is a no-op.
  removeDocument(documentId: string): void {
    const sql = this.sql;
    sql.exec("BEGIN");
    try {
      // FTS rows for binder_chunk_refs drop automatically via triggers.
      sql.exec("DELETE FROM binder_chunk_refs WHERE document_id = ?", documentId);
      sql.exec("DELETE FROM shelf_documents WHERE document_id = ?", documentId);
      sql.exec("DELETE FROM highlights WHERE document_id = ?", documentId);
      sql.exec("DELETE FROM notes WHERE document_id = ?", documentId);
      sql.exec("DELETE FROM progress WHERE document_id = ?", documentId);
      sql.exec(
        "UPDATE conversations SET primary_document_id = NULL WHERE primary_document_id = ?",
        documentId,
      );
      sql.exec("DELETE FROM documents WHERE document_id = ?", documentId);
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }

  // ---------------- Shelves --------------------------------------------------

  createShelf(input: ShelfCreateInput): ShelfRowWithCount {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO shelves(shelf_id, name, description, position, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      input.shelfId,
      input.name,
      input.description,
      now,
      now,
    );
    const row = this.#getShelfRow(input.shelfId);
    if (!row) throw new Error(`Shelf insert disappeared: ${input.shelfId}`);
    return { ...row, itemCount: 0 };
  }

  // List shelves with itemCount derived from shelf_documents. Sort:
  // position ASC NULLS LAST, then createdAt ASC — explicitly-positioned
  // shelves come first.
  listShelves(): ShelfRowWithCount[] {
    const rows = this.sql
      .exec<ShelfRowSql & { item_count: number }>(
        `SELECT
           s.shelf_id, s.name, s.description, s.position, s.created_at, s.updated_at,
           COUNT(sd.document_id) AS item_count
         FROM shelves s
         LEFT JOIN shelf_documents sd ON sd.shelf_id = s.shelf_id
         GROUP BY s.shelf_id
         ORDER BY (s.position IS NULL), s.position ASC, s.created_at ASC`,
      )
      .toArray();
    return rows.map((r) => ({ ...rowToShelf(r), itemCount: Number(r.item_count ?? 0) }));
  }

  getShelf(shelfId: string): ShelfRowWithCount | null {
    const rows = this.sql
      .exec<ShelfRowSql & { item_count: number }>(
        `SELECT
           s.shelf_id, s.name, s.description, s.position, s.created_at, s.updated_at,
           COUNT(sd.document_id) AS item_count
         FROM shelves s
         LEFT JOIN shelf_documents sd ON sd.shelf_id = s.shelf_id
         WHERE s.shelf_id = ?
         GROUP BY s.shelf_id`,
        shelfId,
      )
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return { ...rowToShelf(row), itemCount: Number(row.item_count ?? 0) };
  }

  shelfExists(shelfId: string): boolean {
    const rows = this.sql
      .exec<{ shelf_id: string }>(`SELECT shelf_id FROM shelves WHERE shelf_id = ?`, shelfId)
      .toArray();
    return rows.length > 0;
  }

  findShelfByLowerName(nameLower: string): { shelfId: string } | null {
    const rows = this.sql
      .exec<{ shelf_id: string }>(`SELECT shelf_id FROM shelves WHERE lower(name) = ?`, nameLower)
      .toArray();
    const row = rows[0];
    return row ? { shelfId: row.shelf_id } : null;
  }

  updateShelf(input: {
    shelfId: string;
    name?: string;
    description?: string | null;
    position?: number | null;
  }): ShelfRowWithCount | null {
    const existing = this.#getShelfRow(input.shelfId);
    if (!existing) return null;
    const now = Date.now();
    if (input.name !== undefined) {
      this.sql.exec(
        `UPDATE shelves SET name = ?, updated_at = ? WHERE shelf_id = ?`,
        input.name,
        now,
        input.shelfId,
      );
    }
    if (input.description !== undefined) {
      this.sql.exec(
        `UPDATE shelves SET description = ?, updated_at = ? WHERE shelf_id = ?`,
        input.description,
        now,
        input.shelfId,
      );
    }
    if (input.position !== undefined) {
      this.sql.exec(
        `UPDATE shelves SET position = ?, updated_at = ? WHERE shelf_id = ?`,
        input.position,
        now,
        input.shelfId,
      );
    }
    return this.getShelf(input.shelfId);
  }

  removeShelf(shelfId: string): boolean {
    const existed = this.shelfExists(shelfId);
    this.sql.exec("BEGIN");
    try {
      this.sql.exec(`DELETE FROM shelf_documents WHERE shelf_id = ?`, shelfId);
      this.sql.exec(`DELETE FROM shelves WHERE shelf_id = ?`, shelfId);
      this.sql.exec("COMMIT");
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
    return existed;
  }

  // ---------------- Shelf membership -----------------------------------------

  addShelfDocument(input: { shelfId: string; documentId: string }): void {
    // Idempotent: re-add preserves original addedAt + position.
    this.sql.exec(
      `INSERT INTO shelf_documents(shelf_id, document_id, position, added_at)
       VALUES (?, ?, NULL, ?)
       ON CONFLICT(shelf_id, document_id) DO NOTHING`,
      input.shelfId,
      input.documentId,
      Date.now(),
    );
  }

  removeShelfDocument(input: { shelfId: string; documentId: string }): boolean {
    const existed =
      this.sql
        .exec<{ document_id: string }>(
          `SELECT document_id FROM shelf_documents WHERE shelf_id = ? AND document_id = ?`,
          input.shelfId,
          input.documentId,
        )
        .toArray().length > 0;
    this.sql.exec(
      `DELETE FROM shelf_documents WHERE shelf_id = ? AND document_id = ?`,
      input.shelfId,
      input.documentId,
    );
    return existed;
  }

  updateShelfMembershipPosition(input: {
    shelfId: string;
    documentId: string;
    position: number | null;
  }): boolean {
    const existed =
      this.sql
        .exec<{ document_id: string }>(
          `SELECT document_id FROM shelf_documents WHERE shelf_id = ? AND document_id = ?`,
          input.shelfId,
          input.documentId,
        )
        .toArray().length > 0;
    if (!existed) return false;
    this.sql.exec(
      `UPDATE shelf_documents SET position = ? WHERE shelf_id = ? AND document_id = ?`,
      input.position,
      input.shelfId,
      input.documentId,
    );
    return true;
  }

  // Documents on a custom shelf, joined to progress for the embedded
  // snapshot. Sort: position ASC NULLS LAST, then addedAt ASC.
  listShelfDocuments(shelfId: string): DocumentWithProgressRow[] {
    const rows = this.sql
      .exec<DocumentWithProgressRowSql>(
        `SELECT d.*,
                p.section_key       AS progress_section_key,
                p.progress_percent  AS progress_percent_join,
                p.updated_at        AS progress_updated_at
         FROM shelf_documents sd
         INNER JOIN documents d ON d.document_id = sd.document_id
         LEFT JOIN progress p ON p.document_id = d.document_id
         WHERE sd.shelf_id = ?
         ORDER BY (sd.position IS NULL), sd.position ASC, sd.added_at ASC`,
        shelfId,
      )
      .toArray();
    return rows.map(rowToDocumentWithProgress);
  }

  // Smart shelves: synthesised from progress.
  // "reading"  = progress row exists AND (percent IS NULL OR percent < 1)
  // "finished" = percent = 1
  smartCounts(): { reading: number; finished: number } {
    const rows = this.sql
      .exec<{ reading: number; finished: number }>(
        `SELECT
           SUM(CASE WHEN progress_percent IS NULL OR progress_percent < 1 THEN 1 ELSE 0 END) AS reading,
           SUM(CASE WHEN progress_percent = 1 THEN 1 ELSE 0 END) AS finished
         FROM progress`,
      )
      .toArray();
    const row = rows[0];
    return {
      reading: Number(row?.reading ?? 0),
      finished: Number(row?.finished ?? 0),
    };
  }

  smartDocuments(smartType: "reading" | "finished"): DocumentWithProgressRow[] {
    const condition =
      smartType === "finished"
        ? "p.progress_percent = 1"
        : "(p.progress_percent IS NULL OR p.progress_percent < 1)";
    const rows = this.sql
      .exec<DocumentWithProgressRowSql>(
        `SELECT d.*,
                p.section_key       AS progress_section_key,
                p.progress_percent  AS progress_percent_join,
                p.updated_at        AS progress_updated_at
         FROM progress p
         INNER JOIN documents d ON d.document_id = p.document_id
         WHERE ${condition}
         ORDER BY p.updated_at DESC`,
      )
      .toArray();
    return rows.map(rowToDocumentWithProgress);
  }

  // Reverse lookup: shelves containing a document. itemCount included.
  shelvesForDocument(documentId: string): ShelfRowWithCount[] {
    const rows = this.sql
      .exec<ShelfRowSql & { item_count: number }>(
        `SELECT
           s.shelf_id, s.name, s.description, s.position, s.created_at, s.updated_at,
           (SELECT COUNT(*) FROM shelf_documents sd WHERE sd.shelf_id = s.shelf_id) AS item_count
         FROM shelves s
         WHERE s.shelf_id IN (
           SELECT shelf_id FROM shelf_documents WHERE document_id = ?
         )
         ORDER BY (s.position IS NULL), s.position ASC, s.created_at ASC`,
        documentId,
      )
      .toArray();
    return rows.map((r) => ({ ...rowToShelf(r), itemCount: Number(r.item_count ?? 0) }));
  }

  // ---------------- Conversations -------------------------------------------

  createConversation(input: ConversationCreateInput): ConversationRow {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO conversations(conversation_id, title, primary_document_id, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?)`,
      input.conversationId,
      input.title,
      input.primaryDocumentId,
      now,
      now,
    );
    const row = this.getConversation(input.conversationId);
    if (!row) throw new Error(`Conversation insert disappeared: ${input.conversationId}`);
    return row;
  }

  getConversation(conversationId: string): ConversationRow | null {
    const rows = this.sql
      .exec<ConversationRowSql>(
        `SELECT conversation_id, title, primary_document_id, created_at, last_activity_at
         FROM conversations WHERE conversation_id = ?`,
        conversationId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToConversation(row) : null;
  }

  // List by recency — sidebar ordering. No paging in v1; the binder is
  // per-user and conversation count is bounded by user activity.
  listConversations(): ConversationRow[] {
    const rows = this.sql
      .exec<ConversationRowSql>(
        `SELECT conversation_id, title, primary_document_id, created_at, last_activity_at
         FROM conversations ORDER BY last_activity_at DESC`,
      )
      .toArray();
    return rows.map(rowToConversation);
  }

  updateConversation(input: ConversationUpdateInput): ConversationRow | null {
    const existing = this.getConversation(input.conversationId);
    if (!existing) return null;
    if (input.title !== undefined) {
      this.sql.exec(
        `UPDATE conversations SET title = ? WHERE conversation_id = ?`,
        input.title,
        input.conversationId,
      );
    }
    return this.getConversation(input.conversationId);
  }

  // Bump last_activity_at; returns null if the row is gone (silent no-op
  // for callers that don't want to error on a deleted-mid-turn race).
  touchConversation(conversationId: string): ConversationRow | null {
    const existing = this.getConversation(conversationId);
    if (!existing) return null;
    this.sql.exec(
      `UPDATE conversations SET last_activity_at = ? WHERE conversation_id = ?`,
      Date.now(),
      conversationId,
    );
    return this.getConversation(conversationId);
  }

  removeConversation(conversationId: string): boolean {
    const existed = this.getConversation(conversationId) !== null;
    this.sql.exec(`DELETE FROM conversations WHERE conversation_id = ?`, conversationId);
    return existed;
  }

  #getShelfRow(shelfId: string): ShelfRow | null {
    const rows = this.sql
      .exec<ShelfRowSql>(
        `SELECT shelf_id, name, description, position, created_at, updated_at
         FROM shelves WHERE shelf_id = ?`,
        shelfId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToShelf(row) : null;
  }

  // ---------------- Progress -------------------------------------------------

  upsertProgress(input: ProgressInput): ProgressRow {
    const now = Date.now();
    const positionJson = input.position === null ? null : JSON.stringify(input.position);
    this.sql.exec(
      `INSERT INTO progress(document_id, section_key, position_json, progress_percent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET
         section_key = excluded.section_key,
         position_json = excluded.position_json,
         progress_percent = excluded.progress_percent,
         updated_at = excluded.updated_at`,
      input.documentId,
      input.sectionKey,
      positionJson,
      input.progressPercent,
      now,
      now,
    );
    const row = this.getProgress(input.documentId);
    if (!row) throw new Error(`Progress upsert disappeared: ${input.documentId}`);
    return row;
  }

  getProgress(documentId: string): ProgressRow | null {
    const rows = this.sql
      .exec<ProgressRowSql>(
        `SELECT document_id, section_key, position_json, progress_percent, created_at, updated_at
         FROM progress WHERE document_id = ?`,
        documentId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToProgress(row) : null;
  }

  // Batch fetch keyed by documentId — used by listDocuments to compose the
  // embedded progress snapshot per row without N+1 reads.
  listProgressByDocuments(documentIds: string[]): Map<string, ProgressRow> {
    const out = new Map<string, ProgressRow>();
    if (documentIds.length === 0) return out;
    const placeholders = documentIds.map(() => "?").join(",");
    const rows = this.sql
      .exec<ProgressRowSql>(
        `SELECT document_id, section_key, position_json, progress_percent, created_at, updated_at
         FROM progress WHERE document_id IN (${placeholders})`,
        ...documentIds,
      )
      .toArray();
    for (const r of rows) out.set(r.document_id, rowToProgress(r));
    return out;
  }

  // ---------------- Highlights -----------------------------------------------

  createHighlight(input: HighlightCreateInput): HighlightRow {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO highlights(highlight_id, document_id, section_key, position_json, text_snippet, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.highlightId,
      input.documentId,
      input.sectionKey,
      JSON.stringify(input.position),
      input.textSnippet,
      input.color,
      now,
      now,
    );
    const row = this.getHighlight(input.highlightId);
    if (!row) throw new Error(`Highlight insert disappeared: ${input.highlightId}`);
    return row;
  }

  getHighlight(highlightId: string): HighlightRow | null {
    const rows = this.sql
      .exec<HighlightRowSql>(
        `SELECT highlight_id, document_id, section_key, position_json, text_snippet, color, created_at, updated_at
         FROM highlights WHERE highlight_id = ?`,
        highlightId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToHighlight(row) : null;
  }

  // Section-scoped list, document-scoped list. createdAt ASC for stable
  // reading-order — user-visible ordering follows insertion time.
  listHighlights(input: { documentId: string; sectionKey?: string }): HighlightRow[] {
    const conds = ["document_id = ?"];
    const args: unknown[] = [input.documentId];
    if (input.sectionKey !== undefined) {
      conds.push("section_key = ?");
      args.push(input.sectionKey);
    }
    const rows = this.sql
      .exec<HighlightRowSql>(
        `SELECT highlight_id, document_id, section_key, position_json, text_snippet, color, created_at, updated_at
         FROM highlights WHERE ${conds.join(" AND ")} ORDER BY created_at ASC`,
        ...args,
      )
      .toArray();
    return rows.map(rowToHighlight);
  }

  // Corpus-wide; createdAt DESC. Optional documentId filter, optional limit.
  listHighlightsAll(input: { documentId?: string; limit?: number }): HighlightRow[] {
    const limit = input.limit ?? 50;
    const args: unknown[] = [];
    let where = "";
    if (input.documentId !== undefined) {
      where = "WHERE document_id = ?";
      args.push(input.documentId);
    }
    args.push(limit);
    const rows = this.sql
      .exec<HighlightRowSql>(
        `SELECT highlight_id, document_id, section_key, position_json, text_snippet, color, created_at, updated_at
         FROM highlights ${where} ORDER BY created_at DESC LIMIT ?`,
        ...args,
      )
      .toArray();
    return rows.map(rowToHighlight);
  }

  updateHighlight(input: { highlightId: string; color?: string }): HighlightRow | null {
    const existing = this.getHighlight(input.highlightId);
    if (!existing) return null;
    const now = Date.now();
    if (input.color !== undefined) {
      this.sql.exec(
        `UPDATE highlights SET color = ?, updated_at = ? WHERE highlight_id = ?`,
        input.color,
        now,
        input.highlightId,
      );
    }
    return this.getHighlight(input.highlightId);
  }

  // Cascades through to notes — removing a highlight nukes any notes that
  // anchor to it, mirroring the original D1 `highlight_id ON DELETE CASCADE`
  // and the comment in `db/schema/note.ts`. The note loses its anchor, so
  // dropping it is the right semantic.
  removeHighlight(highlightId: string): boolean {
    const existed = this.getHighlight(highlightId) !== null;
    this.sql.exec("BEGIN");
    try {
      this.sql.exec(`DELETE FROM notes WHERE highlight_id = ?`, highlightId);
      this.sql.exec(`DELETE FROM highlights WHERE highlight_id = ?`, highlightId);
      this.sql.exec("COMMIT");
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
    return existed;
  }

  // ---------------- Notes ----------------------------------------------------

  createNote(input: NoteCreateInput): NoteRow {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO notes(note_id, document_id, section_key, highlight_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.noteId,
      input.documentId,
      input.sectionKey,
      input.highlightId,
      input.body,
      now,
      now,
    );
    const row = this.getNote(input.noteId);
    if (!row) throw new Error(`Note insert disappeared: ${input.noteId}`);
    return row;
  }

  getNote(noteId: string): NoteRow | null {
    const rows = this.sql
      .exec<NoteRowSql>(
        `SELECT note_id, document_id, section_key, highlight_id, body, created_at, updated_at
         FROM notes WHERE note_id = ?`,
        noteId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToNote(row) : null;
  }

  listNotes(input: {
    documentId: string;
    sectionKey?: string;
    highlightId?: string;
    unanchored?: boolean;
  }): NoteRow[] {
    const conds = ["document_id = ?"];
    const args: unknown[] = [input.documentId];
    if (input.sectionKey !== undefined) {
      conds.push("section_key = ?");
      args.push(input.sectionKey);
    }
    if (input.highlightId !== undefined) {
      conds.push("highlight_id = ?");
      args.push(input.highlightId);
    }
    if (input.unanchored === true) {
      conds.push("section_key IS NULL");
      conds.push("highlight_id IS NULL");
    }
    const rows = this.sql
      .exec<NoteRowSql>(
        `SELECT note_id, document_id, section_key, highlight_id, body, created_at, updated_at
         FROM notes WHERE ${conds.join(" AND ")} ORDER BY created_at ASC`,
        ...args,
      )
      .toArray();
    return rows.map(rowToNote);
  }

  listNotesAll(input: { documentId?: string; limit?: number }): NoteRow[] {
    const limit = input.limit ?? 50;
    const args: unknown[] = [];
    let where = "";
    if (input.documentId !== undefined) {
      where = "WHERE document_id = ?";
      args.push(input.documentId);
    }
    args.push(limit);
    const rows = this.sql
      .exec<NoteRowSql>(
        `SELECT note_id, document_id, section_key, highlight_id, body, created_at, updated_at
         FROM notes ${where} ORDER BY created_at DESC LIMIT ?`,
        ...args,
      )
      .toArray();
    return rows.map(rowToNote);
  }

  updateNote(input: { noteId: string; body?: string }): NoteRow | null {
    const existing = this.getNote(input.noteId);
    if (!existing) return null;
    const now = Date.now();
    if (input.body !== undefined) {
      this.sql.exec(
        `UPDATE notes SET body = ?, updated_at = ? WHERE note_id = ?`,
        input.body,
        now,
        input.noteId,
      );
    }
    return this.getNote(input.noteId);
  }

  removeNote(noteId: string): boolean {
    const existed = this.getNote(noteId) !== null;
    this.sql.exec(`DELETE FROM notes WHERE note_id = ?`, noteId);
    return existed;
  }

  #getDocumentRow(documentId: string): DocumentRow | null {
    const rows = this.sql
      .exec<DocumentRowSql>(`SELECT * FROM documents WHERE document_id = ?`, documentId)
      .toArray();
    const row = rows[0];
    return row ? rowToDocument(row) : null;
  }

  #runMigrations(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const applied = new Set<number>();
    for (const row of this.sql.exec<{ id: number }>("SELECT id FROM _sql_schema_migrations")) {
      applied.add(row.id);
    }
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      this.sql.exec(migration.sql);
      this.sql.exec("INSERT INTO _sql_schema_migrations(id) VALUES (?)", migration.id);
    }
  }
}

type DocumentRowSql = {
  document_id: string;
  kind: string;
  mime_type: string;
  original_filename: string;
  size_bytes: number;
  content_hash: string;
  title: string;
  sensitive: number;
  status: string;
  error_reason: string | null;
  cover_image: string | null;
  source_url: string | null;
  original_key: string;
  manifest_key: string | null;
  created_at: number;
  updated_at: number;
};

const rowToDocument = (row: DocumentRowSql): DocumentRow => ({
  documentId: row.document_id,
  kind: row.kind,
  mimeType: row.mime_type,
  originalFilename: row.original_filename,
  sizeBytes: row.size_bytes,
  contentHash: row.content_hash,
  title: row.title,
  sensitive: row.sensitive === 1,
  status: row.status,
  errorReason: row.error_reason,
  coverImage: row.cover_image,
  sourceUrl: row.source_url,
  originalKey: row.original_key,
  manifestKey: row.manifest_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type ProgressRowSql = {
  document_id: string;
  section_key: string;
  position_json: string | null;
  progress_percent: number | null;
  created_at: number;
  updated_at: number;
};

const rowToProgress = (row: ProgressRowSql): ProgressRow => ({
  documentId: row.document_id,
  sectionKey: row.section_key,
  position: row.position_json === null ? null : (JSON.parse(row.position_json) as PositionPayload),
  progressPercent: row.progress_percent,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type HighlightRowSql = {
  highlight_id: string;
  document_id: string;
  section_key: string;
  position_json: string;
  text_snippet: string;
  color: string;
  created_at: number;
  updated_at: number;
};

const rowToHighlight = (row: HighlightRowSql): HighlightRow => ({
  highlightId: row.highlight_id,
  documentId: row.document_id,
  sectionKey: row.section_key,
  position: JSON.parse(row.position_json) as PositionPayload,
  textSnippet: row.text_snippet,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type NoteRowSql = {
  note_id: string;
  document_id: string;
  section_key: string | null;
  highlight_id: string | null;
  body: string;
  created_at: number;
  updated_at: number;
};

const rowToNote = (row: NoteRowSql): NoteRow => ({
  noteId: row.note_id,
  documentId: row.document_id,
  sectionKey: row.section_key,
  highlightId: row.highlight_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type ShelfRowSql = {
  shelf_id: string;
  name: string;
  description: string | null;
  position: number | null;
  created_at: number;
  updated_at: number;
};

const rowToShelf = (row: ShelfRowSql): ShelfRow => ({
  shelfId: row.shelf_id,
  name: row.name,
  description: row.description,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type DocumentWithProgressRowSql = DocumentRowSql & {
  progress_section_key: string | null;
  progress_percent_join: number | null;
  progress_updated_at: number | null;
};

const rowToDocumentWithProgress = (row: DocumentWithProgressRowSql): DocumentWithProgressRow => ({
  ...rowToDocument(row),
  progress:
    row.progress_section_key && row.progress_updated_at !== null
      ? {
          sectionKey: row.progress_section_key,
          progressPercent: row.progress_percent_join,
          updatedAt: row.progress_updated_at,
        }
      : null,
});

type ConversationRowSql = {
  conversation_id: string;
  title: string;
  primary_document_id: string | null;
  created_at: number;
  last_activity_at: number;
};

const rowToConversation = (row: ConversationRowSql): ConversationRow => ({
  conversationId: row.conversation_id,
  title: row.title,
  primaryDocumentId: row.primary_document_id,
  createdAt: row.created_at,
  lastActivityAt: row.last_activity_at,
});
