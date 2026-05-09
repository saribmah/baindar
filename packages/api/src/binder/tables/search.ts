export const binderChunkRefsTableSql = `
  -- Cross-binder chunk references. Sibling to the contentless FTS5 index
  -- below: chunk text is tokenized into binder_chunks_fts but not stored
  -- here, keeping BinderDO well under the 10 GB per-DO ceiling for power
  -- users (PRD §9). document_title is denormalised on this table for
  -- display in search results; it is intentionally NOT indexed in
  -- binder_chunks_fts so document renames stay O(1) (no FTS rebuild).
  CREATE TABLE binder_chunk_refs (
    rowid INTEGER PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    document_title TEXT NOT NULL,
    kind TEXT NOT NULL,
    section_key TEXT NOT NULL,
    section_title TEXT,
    section_order INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    text_path TEXT NOT NULL
  );
  CREATE INDEX idx_binder_chunk_refs_document ON binder_chunk_refs(document_id);
  CREATE INDEX idx_binder_chunk_refs_kind ON binder_chunk_refs(kind);
  CREATE UNIQUE INDEX idx_binder_chunk_refs_unique
    ON binder_chunk_refs(document_id, section_key, chunk_index);
`;

export const binderChunksFtsTableSql = `
  -- contentless_delete=1 (SQLite >= 3.43) lets standard SQL DELETE remove
  -- rows without re-supplying every original column value, so FK CASCADE
  -- + a trivial AD trigger on binder_chunk_refs cleans up FTS rows. Index
  -- writes (INSERT) are driven explicitly from BinderSearchStore — no AI/AU
  -- triggers, since binder_chunk_refs no longer carries the chunk text those
  -- triggers would have read. document_title is intentionally absent: title
  -- token matches against chunks aren't worth the rebuild cost on rename;
  -- title still appears in search results via the JOIN to binder_chunk_refs.
  CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
    section_title,
    text,
    content='',
    contentless_delete=1,
    tokenize='porter unicode61 remove_diacritics 2'
  );
`;

export const binderChunkRefsTriggersSql = `
  CREATE TRIGGER binder_chunk_refs_ad AFTER DELETE ON binder_chunk_refs BEGIN
    DELETE FROM binder_chunks_fts WHERE rowid = old.rowid;
  END;
`;

export type BinderSearchHit = {
  documentId: string;
  documentTitle: string;
  kind: string;
  sectionKey: string;
  sectionTitle: string | null;
  chunkIndex: number;
  score: number;
  terms: string[];
};

export type BinderSearchInput = {
  query: string;
  limit?: number;
  kind?: string;
  excludeDocumentId?: string;
  excludeSectionKey?: string;
};
