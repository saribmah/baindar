// Progress lives in BinderDO storage. Schema owned by this feature;
// `progressTableSql` is composed into the binder initial migration.
//
// `PositionPayload` is the loose JSON-object shape the BinderDO RPC layer
// accepts and returns for highlight + progress positions. Each feature
// narrows it to its concrete `Position` shape at the feature boundary.

export const progressTableSql = `
  CREATE TABLE progress (
    document_id TEXT PRIMARY KEY REFERENCES documents(document_id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    position_json TEXT,
    progress_percent REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_progress_updated_at ON progress(updated_at);
`;

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

export type ProgressRowSql = {
  document_id: string;
  section_key: string;
  position_json: string | null;
  progress_percent: number | null;
  created_at: number;
  updated_at: number;
};

export const rowToProgress = (row: ProgressRowSql): ProgressRow => ({
  documentId: row.document_id,
  sectionKey: row.section_key,
  position: row.position_json === null ? null : (JSON.parse(row.position_json) as PositionPayload),
  progressPercent: row.progress_percent,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
