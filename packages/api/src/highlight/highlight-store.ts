import {
  rowToHighlight,
  type HighlightCreateInput,
  type HighlightRow,
  type HighlightRowSql,
} from "./table";

export type { HighlightCreateInput, HighlightRow } from "./table";

// Per-feature SQL store, scoped to a BinderDO's `SqlStorage`. Owns all
// reads/writes against the `highlights` table. Migrations are run once at
// the BinderDO host level — stores assume the schema is already applied.
export class HighlightStore {
  constructor(private readonly sql: SqlStorage) {}

  create(input: HighlightCreateInput): HighlightRow {
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
    const row = this.get(input.highlightId);
    if (!row) throw new Error(`Highlight insert disappeared: ${input.highlightId}`);
    return row;
  }

  get(highlightId: string): HighlightRow | null {
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

  // Section-scoped or document-scoped list. createdAt ASC for stable
  // reading-order — user-visible ordering follows insertion time.
  list(input: { documentId: string; sectionKey?: string }): HighlightRow[] {
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
  listAll(input: { documentId?: string; limit?: number }): HighlightRow[] {
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

  update(input: { highlightId: string; color?: string }): HighlightRow | null {
    const existing = this.get(input.highlightId);
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
    return this.get(input.highlightId);
  }

  // Cascades through to notes — removing a highlight nukes any notes that
  // anchor to it, mirroring the original D1 `highlight_id ON DELETE CASCADE`.
  // The note loses its anchor, so dropping it is the right semantic.
  remove(highlightId: string): boolean {
    const existed = this.get(highlightId) !== null;
    this.sql.exec(`DELETE FROM highlights WHERE highlight_id = ?`, highlightId);
    return existed;
  }
}
