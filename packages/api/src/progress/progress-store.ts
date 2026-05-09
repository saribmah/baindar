import { rowToProgress, type ProgressInput, type ProgressRow, type ProgressRowSql } from "./table";

export type { PositionPayload, ProgressInput, ProgressRow } from "./table";

// Per-feature SQL store, scoped to a BinderDO's `SqlStorage`. Owns all
// reads/writes against the `progress` table.
export class ProgressStore {
  constructor(private readonly sql: SqlStorage) {}

  upsert(input: ProgressInput): ProgressRow {
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
    const row = this.get(input.documentId);
    if (!row) throw new Error(`Progress upsert disappeared: ${input.documentId}`);
    return row;
  }

  get(documentId: string): ProgressRow | null {
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
  listByDocuments(documentIds: string[]): Map<string, ProgressRow> {
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
}
