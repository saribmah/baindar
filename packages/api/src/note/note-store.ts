import { rowToNote, type NoteCreateInput, type NoteRow, type NoteRowSql } from "./table";

export type { NoteCreateInput, NoteRow } from "./table";

// Per-feature SQL store, scoped to a BinderDO's `SqlStorage`. Owns all
// reads/writes against the `notes` table. Migrations are run once at the
// BinderDO host level — stores assume the schema is already applied.
export class NoteStore {
  constructor(private readonly sql: SqlStorage) {}

  create(input: NoteCreateInput): NoteRow {
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
    const row = this.get(input.noteId);
    if (!row) throw new Error(`Note insert disappeared: ${input.noteId}`);
    return row;
  }

  get(noteId: string): NoteRow | null {
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

  list(input: {
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

  listAll(input: { documentId?: string; limit?: number }): NoteRow[] {
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

  update(input: { noteId: string; body?: string }): NoteRow | null {
    const existing = this.get(input.noteId);
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
    return this.get(input.noteId);
  }

  remove(noteId: string): boolean {
    const existed = this.get(noteId) !== null;
    this.sql.exec(`DELETE FROM notes WHERE note_id = ?`, noteId);
    return existed;
  }
}
