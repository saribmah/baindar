export const conversationsTableSql = `
  CREATE TABLE conversations (
    conversation_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    primary_document_id TEXT REFERENCES documents(document_id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    last_activity_at INTEGER NOT NULL
  );
  CREATE INDEX idx_conversations_activity ON conversations(last_activity_at);
  CREATE INDEX idx_conversations_primary_document
    ON conversations(primary_document_id);
`;

export type ConversationCreateInput = {
  conversationId: string;
  title: string;
  primaryDocumentId: string | null;
};

export type ConversationRow = {
  conversationId: string;
  title: string;
  primaryDocumentId: string | null;
  createdAt: number;
  lastActivityAt: number;
};

export type ConversationUpdateInput = {
  conversationId: string;
  title?: string;
};

export type ConversationRowSql = {
  conversation_id: string;
  title: string;
  primary_document_id: string | null;
  created_at: number;
  last_activity_at: number;
};

export const rowToConversation = (row: ConversationRowSql): ConversationRow => ({
  conversationId: row.conversation_id,
  title: row.title,
  primaryDocumentId: row.primary_document_id,
  createdAt: row.created_at,
  lastActivityAt: row.last_activity_at,
});
