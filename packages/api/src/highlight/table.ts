import type { PositionPayload } from "../progress/table";

// Highlights live in BinderDO storage. Schema owned by this feature;
// `highlightsTableSql` is composed into the binder initial migration.

export const highlightsTableSql = `
  CREATE TABLE highlights (
    highlight_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    position_json TEXT NOT NULL,
    text_snippet TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_highlights_document_section ON highlights(document_id, section_key);
  CREATE UNIQUE INDEX idx_highlights_document_unique ON highlights(highlight_id, document_id);
  CREATE INDEX idx_highlights_created_at ON highlights(created_at);
`;

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

export type HighlightRowSql = {
  highlight_id: string;
  document_id: string;
  section_key: string;
  position_json: string;
  text_snippet: string;
  color: string;
  created_at: number;
  updated_at: number;
};

export const rowToHighlight = (row: HighlightRowSql): HighlightRow => ({
  highlightId: row.highlight_id,
  documentId: row.document_id,
  sectionKey: row.section_key,
  position: JSON.parse(row.position_json) as PositionPayload,
  textSnippet: row.text_snippet,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
