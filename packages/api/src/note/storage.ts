import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { note } from "../db/schema";
import { Instance } from "../instance";
import type { Note } from "./note";

// D1-backed `note` store. All reads/writes are scoped by userId; a row
// owned by another user is treated identically to a missing row.
export namespace NoteStorage {
  export const entitySelect = {
    id: note.id,
    documentId: note.documentId,
    sectionKey: note.sectionKey,
    highlightId: note.highlightId,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  } as const;

  export type EntityRow = {
    id: string;
    documentId: string;
    sectionKey: string | null;
    highlightId: string | null;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  };

  export const toEntity = (row: EntityRow): Note.Entity => ({
    id: row.id,
    documentId: row.documentId,
    sectionKey: row.sectionKey,
    highlightId: row.highlightId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  export type CreateInput = {
    id: string;
    userId: string;
    documentId: string;
    sectionKey: string | null;
    highlightId: string | null;
    body: string;
  };

  export const create = async (input: CreateInput): Promise<Note.Entity> => {
    const now = new Date();
    const row: EntityRow & { userId: string } = {
      id: input.id,
      userId: input.userId,
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      highlightId: input.highlightId,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    await Instance.db.insert(note).values(row);
    return toEntity(row);
  };

  export type ListQuery = {
    documentId: string;
    sectionKey?: string;
    highlightId?: string;
    unanchored?: boolean;
  };

  export const list = async (userId: string, query: ListQuery): Promise<Note.Entity[]> => {
    const conds = [eq(note.userId, userId), eq(note.documentId, query.documentId)];
    if (query.sectionKey !== undefined) {
      conds.push(eq(note.sectionKey, query.sectionKey));
    }
    if (query.highlightId !== undefined) {
      conds.push(eq(note.highlightId, query.highlightId));
    }
    if (query.unanchored === true) {
      conds.push(isNull(note.sectionKey));
      conds.push(isNull(note.highlightId));
    }
    const rows = await Instance.db
      .select(entitySelect)
      .from(note)
      .where(and(...conds))
      .orderBy(asc(note.createdAt));
    return rows.map(toEntity);
  };

  // Corpus-wide list. No documentId required; orders by recency so the chat
  // agent's "what notes did I take recently" queries surface the most useful
  // rows first. Caller is expected to enforce a sane limit.
  export type ListAllQuery = {
    documentId?: string;
    limit?: number;
  };

  export const listAll = async (userId: string, query: ListAllQuery): Promise<Note.Entity[]> => {
    const conds = [eq(note.userId, userId)];
    if (query.documentId !== undefined) conds.push(eq(note.documentId, query.documentId));
    const limit = query.limit ?? 50;
    const rows = await Instance.db
      .select(entitySelect)
      .from(note)
      .where(and(...conds))
      .orderBy(desc(note.createdAt))
      .limit(limit);
    return rows.map(toEntity);
  };

  export const get = async (id: string, userId: string): Promise<Note.Entity | null> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export type UpdatePatch = {
    body?: string;
  };

  export const update = async (
    id: string,
    userId: string,
    patch: UpdatePatch,
  ): Promise<Note.Entity | null> => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.body !== undefined) set["body"] = patch.body;
    const rows = await Instance.db
      .update(note)
      .set(set)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning(entitySelect);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const remove = async (id: string, userId: string): Promise<boolean> => {
    const rows = await Instance.db
      .delete(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning({ id: note.id });
    return rows.length > 0;
  };
}
