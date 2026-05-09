import {
  rowToDocument,
  rowToDocumentWithProgress,
  type CreateDocumentInput,
  type DocumentRow,
  type DocumentRowSql,
  type DocumentWithProgressRow,
  type DocumentWithProgressRowSql,
  type MarkDocumentProcessedInput,
  type UpdateDocumentInput,
} from "./binder-table";

export type {
  CreateDocumentInput,
  DocumentRow,
  DocumentWithProgressRow,
  MarkDocumentProcessedInput,
  UpdateDocumentInput,
} from "./binder-table";

// BinderDO catalog of the user's documents. Owns the `documents` table and
// the joined-with-progress read shape used by listings. Cross-table reads
// (LEFT JOIN progress) are expressed in SQL so this store does not import
// the ProgressStore. Title updates also touch `binder_chunk_refs` so the
// cross-binder FTS surfaces the new title without an index rebuild.
export class BinderDocumentStore {
  constructor(private readonly sql: SqlStorage) {}

  create(input: CreateDocumentInput): DocumentRow {
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
    const row = this.get(input.documentId);
    if (!row) throw new Error(`Document insert disappeared: ${input.documentId}`);
    return row;
  }

  get(documentId: string): DocumentRow | null {
    const rows = this.sql
      .exec<DocumentRowSql>(`SELECT * FROM documents WHERE document_id = ?`, documentId)
      .toArray();
    const row = rows[0];
    return row ? rowToDocument(row) : null;
  }

  getWithProgress(documentId: string): DocumentWithProgressRow | null {
    const rows = this.sql
      .exec<DocumentWithProgressRowSql>(
        `SELECT d.*,
                p.section_key       AS progress_section_key,
                p.progress_percent  AS progress_percent_join,
                p.updated_at        AS progress_updated_at
         FROM documents d
         LEFT JOIN progress p ON p.document_id = d.document_id
         WHERE d.document_id = ?`,
        documentId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToDocumentWithProgress(row) : null;
  }

  list(): DocumentRow[] {
    const rows = this.sql
      .exec<DocumentRowSql>(`SELECT * FROM documents ORDER BY created_at DESC`)
      .toArray();
    return rows.map(rowToDocument);
  }

  listWithProgress(): DocumentWithProgressRow[] {
    const rows = this.sql
      .exec<DocumentWithProgressRowSql>(
        `SELECT d.*,
                p.section_key       AS progress_section_key,
                p.progress_percent  AS progress_percent_join,
                p.updated_at        AS progress_updated_at
         FROM documents d
         LEFT JOIN progress p ON p.document_id = d.document_id
         ORDER BY d.created_at DESC`,
      )
      .toArray();
    return rows.map(rowToDocumentWithProgress);
  }

  update(input: UpdateDocumentInput): DocumentRow | null {
    const existing = this.get(input.documentId);
    if (!existing) return null;
    const now = Date.now();
    if (typeof input.title === "string") {
      this.sql.exec(
        `UPDATE documents SET title = ?, updated_at = ? WHERE document_id = ?`,
        input.title,
        now,
        input.documentId,
      );
      // Keep the cross-binder FTS denormalised title in sync. Reading across
      // tables in SQL is allowed; we don't import the search store.
      this.sql.exec(
        `UPDATE binder_chunk_refs SET document_title = ? WHERE document_id = ?`,
        input.title,
        input.documentId,
      );
    }
    return this.get(input.documentId);
  }

  markProcessed(input: MarkDocumentProcessedInput): void {
    const existing = this.get(input.documentId);
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

  markFailed(input: { documentId: string; reason: string }): void {
    const existing = this.get(input.documentId);
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

  // Idempotent cleanup. Safe under DocumentDeletionWorkflow step replays —
  // re-running against an already-deleted doc is a no-op. FK cascades drop
  // shelf membership, progress, highlights, notes, and binder_chunk_refs;
  // conversations.primary_document_id is set NULL.
  remove(documentId: string): void {
    this.sql.exec("DELETE FROM documents WHERE document_id = ?", documentId);
  }
}
