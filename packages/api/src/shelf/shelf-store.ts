import {
  rowToDocumentWithProgress,
  type DocumentWithProgressRow,
  type DocumentWithProgressRowSql,
} from "../document/binder-table";
import {
  rowToShelf,
  type ShelfCreateInput,
  type ShelfRow,
  type ShelfRowSql,
  type ShelfRowWithCount,
} from "./table";

export type { ShelfCreateInput, ShelfRow, ShelfRowWithCount } from "./table";

// Owns reads/writes against `shelves` + `shelf_documents`. Cross-table
// reads (joining documents, progress, shelf_documents) are expressed in
// SQL — this store does not import peer stores.
export class ShelfStore {
  constructor(private readonly sql: SqlStorage) {}

  create(input: ShelfCreateInput): ShelfRowWithCount {
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
    const row = this.#getRow(input.shelfId);
    if (!row) throw new Error(`Shelf insert disappeared: ${input.shelfId}`);
    return { ...row, itemCount: 0 };
  }

  // List shelves with itemCount derived from shelf_documents. Sort:
  // position ASC NULLS LAST, then createdAt ASC — explicitly-positioned
  // shelves come first.
  list(): ShelfRowWithCount[] {
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

  get(shelfId: string): ShelfRowWithCount | null {
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

  exists(shelfId: string): boolean {
    const rows = this.sql
      .exec<{ shelf_id: string }>(`SELECT shelf_id FROM shelves WHERE shelf_id = ?`, shelfId)
      .toArray();
    return rows.length > 0;
  }

  findByLowerName(nameLower: string): { shelfId: string } | null {
    const rows = this.sql
      .exec<{ shelf_id: string }>(`SELECT shelf_id FROM shelves WHERE lower(name) = ?`, nameLower)
      .toArray();
    const row = rows[0];
    return row ? { shelfId: row.shelf_id } : null;
  }

  update(input: {
    shelfId: string;
    name?: string;
    description?: string | null;
    position?: number | null;
  }): ShelfRowWithCount | null {
    const existing = this.#getRow(input.shelfId);
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
    return this.get(input.shelfId);
  }

  remove(shelfId: string): boolean {
    const existed = this.exists(shelfId);
    this.sql.exec(`DELETE FROM shelves WHERE shelf_id = ?`, shelfId);
    return existed;
  }

  // ---- Membership ---------------------------------------------------------

  addDocument(input: { shelfId: string; documentId: string }): void {
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

  removeDocument(input: { shelfId: string; documentId: string }): boolean {
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

  updateMembershipPosition(input: {
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
  listDocuments(shelfId: string): DocumentWithProgressRow[] {
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

  #getRow(shelfId: string): ShelfRow | null {
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
}
