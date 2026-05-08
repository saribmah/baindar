import { Binder } from "../binder/binder";
import type { ConversationRow } from "../binder/binder-store";
import type { Conversation } from "./conversation";

// BinderDO-backed `conversation` store. UserId scopes to the BinderDO
// instance (`Binder.require(userId)`); a row owned by another user lives
// in another DO and is unreachable.
//
// `ownerOf` is gone — ChatAgent now persists `(userId, conversationId)`
// in its own DO storage on init, so reverse lookup by conversationId is
// no longer needed.
export namespace ConversationStorage {
  const toEntity = (userId: string, row: ConversationRow): Conversation.Entity => ({
    id: row.conversationId,
    agentName: `${userId}:${row.conversationId}`,
    title: row.title,
    primaryDocId: row.primaryDocumentId,
    createdAt: new Date(row.createdAt).toISOString(),
    lastActivityAt: new Date(row.lastActivityAt).toISOString(),
  });

  export type CreateInput = {
    id: string;
    userId: string;
    title: string;
    primaryDocId: string | null;
  };

  export const create = async (input: CreateInput): Promise<Conversation.Entity> => {
    const binder = Binder.require(input.userId);
    const row = await binder.createConversation({
      conversationId: input.id,
      title: input.title,
      primaryDocumentId: input.primaryDocId,
    });
    return toEntity(input.userId, row);
  };

  export const list = async (userId: string): Promise<Conversation.Entity[]> => {
    const binder = Binder.require(userId);
    const rows = await binder.listConversations();
    return rows.map((row) => toEntity(userId, row));
  };

  export const get = async (id: string, userId: string): Promise<Conversation.Entity | null> => {
    const binder = Binder.require(userId);
    const row = await binder.getConversation(id);
    return row ? toEntity(userId, row) : null;
  };

  export type UpdatePatch = {
    title?: string;
    lastActivityAt?: Date;
  };

  export const update = async (
    id: string,
    userId: string,
    patch: UpdatePatch,
  ): Promise<Conversation.Entity | null> => {
    const binder = Binder.require(userId);
    // BinderDO splits "rename" from "bump activity" into two RPCs since
    // they have different update semantics — title patches the row,
    // touch only bumps last_activity_at. Compose both here.
    if (patch.title !== undefined) {
      const updated = await binder.updateConversation({ conversationId: id, title: patch.title });
      if (!updated) return null;
    }
    if (patch.lastActivityAt !== undefined) {
      const touched = await binder.touchConversation(id);
      if (!touched) return null;
    }
    if (patch.title === undefined && patch.lastActivityAt === undefined) {
      // No-op caller (matches prior D1 semantics: returns the current row).
      return get(id, userId);
    }
    return get(id, userId);
  };

  export const remove = async (id: string, userId: string): Promise<boolean> => {
    const binder = Binder.require(userId);
    return binder.removeConversation(id);
  };
}
