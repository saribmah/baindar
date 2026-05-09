// Shelves and shelf-membership live in BinderDO storage. Schema owned by
// this feature; `shelvesTableSql` + `shelfDocumentsTableSql` are composed
// into the binder initial migration.

export const shelvesTableSql = `
  CREATE TABLE shelves (
    shelf_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    position REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_shelves_name_lower ON shelves(lower(name));
`;

export const shelfDocumentsTableSql = `
  CREATE TABLE shelf_documents (
    shelf_id TEXT NOT NULL REFERENCES shelves(shelf_id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    position REAL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (shelf_id, document_id)
  );
  CREATE INDEX idx_shelf_documents_document ON shelf_documents(document_id);
`;

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

export type ShelfRowSql = {
  shelf_id: string;
  name: string;
  description: string | null;
  position: number | null;
  created_at: number;
  updated_at: number;
};

export const rowToShelf = (row: ShelfRowSql): ShelfRow => ({
  shelfId: row.shelf_id,
  name: row.name,
  description: row.description,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
