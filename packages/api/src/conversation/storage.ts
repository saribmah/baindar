import { and, desc, eq } from "drizzle-orm";
import { conversation } from "../db/schema";
import { Instance } from "../instance";
import type { Conversation } from "./conversation";

// D1-backed `conversation` store. All reads/writes are scoped by userId; a row
// owned by another user is treated identically to a missing row.
export namespace ConversationStorage {
  export const entitySelect = {
    id: conversation.id,
    title: conversation.title,
    primaryDocId: conversation.primaryDocId,
    createdAt: conversation.createdAt,
    lastActivityAt: conversation.lastActivityAt,
  } as const;

  export type EntityRow = {
    id: string;
    title: string;
    primaryDocId: string | null;
    createdAt: Date;
    lastActivityAt: Date;
  };

  export const toEntity = (row: EntityRow): Conversation.Entity => ({
    id: row.id,
    title: row.title,
    primaryDocId: row.primaryDocId,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
  });

  export type CreateInput = {
    id: string;
    userId: string;
    title: string;
    primaryDocId: string | null;
  };

  export const create = async (input: CreateInput): Promise<Conversation.Entity> => {
    const now = new Date();
    const row: EntityRow & { userId: string } = {
      id: input.id,
      userId: input.userId,
      title: input.title,
      primaryDocId: input.primaryDocId,
      createdAt: now,
      lastActivityAt: now,
    };
    await Instance.db.insert(conversation).values(row);
    return toEntity(row);
  };

  export const list = async (userId: string): Promise<Conversation.Entity[]> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(desc(conversation.lastActivityAt));
    return rows.map(toEntity);
  };

  export const get = async (id: string, userId: string): Promise<Conversation.Entity | null> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
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
    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set["title"] = patch.title;
    if (patch.lastActivityAt !== undefined) set["lastActivityAt"] = patch.lastActivityAt;
    if (Object.keys(set).length === 0) {
      // Nothing to update — return the current row so callers don't 404.
      return get(id, userId);
    }
    const rows = await Instance.db
      .update(conversation)
      .set(set)
      .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
      .returning(entitySelect);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const remove = async (id: string, userId: string): Promise<boolean> => {
    const rows = await Instance.db
      .delete(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
      .returning({ id: conversation.id });
    return rows.length > 0;
  };
}
