import {
  rowToConversation,
  type ConversationCreateInput,
  type ConversationRow,
  type ConversationRowSql,
  type ConversationUpdateInput,
} from "./table";

export type { ConversationCreateInput, ConversationRow, ConversationUpdateInput } from "./table";

// Per-feature SQL store, scoped to a BinderDO's `SqlStorage`. Owns all
// reads/writes against the `conversations` table.
export class ConversationStore {
  constructor(private readonly sql: SqlStorage) {}

  create(input: ConversationCreateInput): ConversationRow {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO conversations(conversation_id, title, primary_document_id, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?)`,
      input.conversationId,
      input.title,
      input.primaryDocumentId,
      now,
      now,
    );
    const row = this.get(input.conversationId);
    if (!row) throw new Error(`Conversation insert disappeared: ${input.conversationId}`);
    return row;
  }

  get(conversationId: string): ConversationRow | null {
    const rows = this.sql
      .exec<ConversationRowSql>(
        `SELECT conversation_id, title, primary_document_id, created_at, last_activity_at
         FROM conversations WHERE conversation_id = ?`,
        conversationId,
      )
      .toArray();
    const row = rows[0];
    return row ? rowToConversation(row) : null;
  }

  // List by recency — sidebar ordering. No paging in v1; the binder is
  // per-user and conversation count is bounded by user activity.
  list(): ConversationRow[] {
    const rows = this.sql
      .exec<ConversationRowSql>(
        `SELECT conversation_id, title, primary_document_id, created_at, last_activity_at
         FROM conversations ORDER BY last_activity_at DESC`,
      )
      .toArray();
    return rows.map(rowToConversation);
  }

  update(input: ConversationUpdateInput): ConversationRow | null {
    const existing = this.get(input.conversationId);
    if (!existing) return null;
    if (input.title !== undefined) {
      this.sql.exec(
        `UPDATE conversations SET title = ? WHERE conversation_id = ?`,
        input.title,
        input.conversationId,
      );
    }
    return this.get(input.conversationId);
  }

  // Bump last_activity_at; returns null if the row is gone (silent no-op
  // for callers that don't want to error on a deleted-mid-turn race).
  touch(conversationId: string): ConversationRow | null {
    const existing = this.get(conversationId);
    if (!existing) return null;
    this.sql.exec(
      `UPDATE conversations SET last_activity_at = ? WHERE conversation_id = ?`,
      Date.now(),
      conversationId,
    );
    return this.get(conversationId);
  }

  remove(conversationId: string): boolean {
    const existed = this.get(conversationId) !== null;
    this.sql.exec(`DELETE FROM conversations WHERE conversation_id = ?`, conversationId);
    return existed;
  }
}
