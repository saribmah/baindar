// Document catalog rows that live in BinderDO storage (the user-visible
// "what documents do I own" table). Schema owned by this feature; the
// binder migration runner composes `documentsTableSql` into its initial
// migration alongside the other feature tables.
//
// This is distinct from `document/tables/` which holds the per-document
// DocumentDO schema (chunks, sections, summaries, document_meta).

export const documentsTableSql = `
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
`;

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

export type DocumentWithProgressRow = DocumentRow & {
  progress: {
    sectionKey: string;
    progressPercent: number | null;
    updatedAt: number;
  } | null;
};

export type DocumentRowSql = {
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

export type DocumentWithProgressRowSql = DocumentRowSql & {
  progress_section_key: string | null;
  progress_percent_join: number | null;
  progress_updated_at: number | null;
};

export const rowToDocument = (row: DocumentRowSql): DocumentRow => ({
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

export const rowToDocumentWithProgress = (
  row: DocumentWithProgressRowSql,
): DocumentWithProgressRow => ({
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
