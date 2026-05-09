// Notes live in BinderDO storage. Schema is owned by this feature; the
// binder migration runner imports `notesTableSql` to compose the initial
// migration alongside the other feature tables.

export const notesTableSql = `
  CREATE TABLE notes (
    note_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    section_key TEXT,
    highlight_id TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (highlight_id, document_id)
      REFERENCES highlights(highlight_id, document_id)
      ON DELETE CASCADE
  );
  CREATE INDEX idx_notes_document_section ON notes(document_id, section_key);
  CREATE INDEX idx_notes_highlight ON notes(highlight_id);
  CREATE INDEX idx_notes_created_at ON notes(created_at);
`;

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

export type NoteRowSql = {
  note_id: string;
  document_id: string;
  section_key: string | null;
  highlight_id: string | null;
  body: string;
  created_at: number;
  updated_at: number;
};

export const rowToNote = (row: NoteRowSql): NoteRow => ({
  noteId: row.note_id,
  documentId: row.document_id,
  sectionKey: row.section_key,
  highlightId: row.highlight_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
