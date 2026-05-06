import { and, asc, desc, eq } from "drizzle-orm";
import { highlight } from "../db/schema";
import { Instance } from "../instance";
import type { Highlight } from "./highlight";

// D1-backed `highlight` store. All reads/writes are scoped by userId; a row
// owned by another user is treated identically to a missing row.
export namespace HighlightStorage {
  export const entitySelect = {
    id: highlight.id,
    documentId: highlight.documentId,
    sectionKey: highlight.sectionKey,
    position: highlight.position,
    textSnippet: highlight.textSnippet,
    color: highlight.color,
    createdAt: highlight.createdAt,
    updatedAt: highlight.updatedAt,
  } as const;

  export type EntityRow = {
    id: string;
    documentId: string;
    sectionKey: string;
    position: Highlight.Position;
    textSnippet: string;
    color: string;
    createdAt: Date;
    updatedAt: Date;
  };

  export const toEntity = (row: EntityRow): Highlight.Entity => ({
    id: row.id,
    documentId: row.documentId,
    sectionKey: row.sectionKey,
    position: row.position,
    textSnippet: row.textSnippet,
    color: parseColor(row.color),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  const parseColor = (raw: string): Highlight.Color => {
    if (
      raw === "pink" ||
      raw === "yellow" ||
      raw === "green" ||
      raw === "blue" ||
      raw === "purple"
    ) {
      return raw;
    }
    return "yellow";
  };

  export type CreateInput = {
    id: string;
    userId: string;
    documentId: string;
    sectionKey: string;
    position: Highlight.Position;
    textSnippet: string;
    color: Highlight.Color;
  };

  export const create = async (input: CreateInput): Promise<Highlight.Entity> => {
    const now = new Date();
    const row: EntityRow & { userId: string } = {
      id: input.id,
      userId: input.userId,
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      position: input.position,
      textSnippet: input.textSnippet,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    };
    await Instance.db.insert(highlight).values(row);
    return toEntity(row);
  };

  export type ListQuery = {
    documentId: string;
    sectionKey?: string;
  };

  export const list = async (userId: string, query: ListQuery): Promise<Highlight.Entity[]> => {
    const conds = [eq(highlight.userId, userId), eq(highlight.documentId, query.documentId)];
    if (query.sectionKey !== undefined) {
      conds.push(eq(highlight.sectionKey, query.sectionKey));
    }
    const rows = await Instance.db
      .select(entitySelect)
      .from(highlight)
      .where(and(...conds))
      .orderBy(asc(highlight.createdAt));
    return rows.map(toEntity);
  };

  // Corpus-wide list. No documentId required; orders by recency so the chat
  // agent's "recent highlights" queries surface the most useful rows first.
  // Caller is expected to enforce a sane limit.
  export type ListAllQuery = {
    documentId?: string;
    limit?: number;
  };

  export const listAll = async (
    userId: string,
    query: ListAllQuery,
  ): Promise<Highlight.Entity[]> => {
    const conds = [eq(highlight.userId, userId)];
    if (query.documentId !== undefined) conds.push(eq(highlight.documentId, query.documentId));
    const limit = query.limit ?? 50;
    const rows = await Instance.db
      .select(entitySelect)
      .from(highlight)
      .where(and(...conds))
      .orderBy(desc(highlight.createdAt))
      .limit(limit);
    return rows.map(toEntity);
  };

  export const get = async (id: string, userId: string): Promise<Highlight.Entity | null> => {
    const rows = await Instance.db
      .select(entitySelect)
      .from(highlight)
      .where(and(eq(highlight.id, id), eq(highlight.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export type UpdatePatch = {
    color?: Highlight.Color;
  };

  export const update = async (
    id: string,
    userId: string,
    patch: UpdatePatch,
  ): Promise<Highlight.Entity | null> => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.color !== undefined) set["color"] = patch.color;
    const rows = await Instance.db
      .update(highlight)
      .set(set)
      .where(and(eq(highlight.id, id), eq(highlight.userId, userId)))
      .returning(entitySelect);
    const row = rows[0];
    return row ? toEntity(row) : null;
  };

  export const remove = async (id: string, userId: string): Promise<boolean> => {
    const rows = await Instance.db
      .delete(highlight)
      .where(and(eq(highlight.id, id), eq(highlight.userId, userId)))
      .returning({ id: highlight.id });
    return rows.length > 0;
  };
}
