export const summariesTableSql = `
  CREATE TABLE summaries (
    target_type TEXT NOT NULL,
    target_key TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    model TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (target_type, target_key, content_hash)
  );
`;

export type SummaryTargetType = "section" | "document";

export type SummaryRow = {
  targetType: SummaryTargetType;
  targetKey: string;
  contentHash: string;
  summary: string;
  model: string;
  r2Key: string;
  createdAt: number;
};

export type SummaryLookupInput = {
  targetType: SummaryTargetType;
  targetKey: string;
  contentHash: string;
};

export type SummaryChunksInput = {
  targetType: SummaryTargetType;
  targetKey: string;
};

export type SummaryChunk = {
  sectionKey: string;
  sectionTitle: string | null;
  sectionOrder: number;
  chunkIndex: number;
  text: string;
};

export type PutSummaryInput = SummaryRow;
