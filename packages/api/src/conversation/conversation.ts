import { z } from "zod";
import { Agent } from "../agent/agent";
import { Document } from "../document/document";
import { NamedError } from "../utils/error";
import { ConversationStorage } from "./storage";

// User-owned chat thread. The id doubles as the ChatAgent Durable Object
// instance name (wired in a follow-up PR — today the DO is still keyed by
// userId), so it must be globally unique and stable for the conversation's
// lifetime.
//
// `primaryDocId` is a soft "started here" hint set when a conversation is
// opened from the reader. It powers reader-side resume lookups and a sidebar
// badge; it does NOT scope what tools the chat agent can call. It's
// immutable after create — to "switch" the primary doc the user creates a
// new conversation.
export namespace Conversation {
  // ---- Errors -----------------------------------------------------------
  export const NotFoundError = NamedError.create(
    "ConversationNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  // ---- Schemas ----------------------------------------------------------
  // Hard cap on title length — UI sidebars truncate further.
  const TITLE_MAX = 200;
  const DEFAULT_TITLE = "Untitled";

  export const Entity = z
    .object({
      id: z.string(),
      title: z.string(),
      primaryDocId: z.string().nullable(),
      createdAt: z.string(),
      lastActivityAt: z.string(),
    })
    .meta({ ref: "Conversation" });
  export type Entity = z.infer<typeof Entity>;

  export const ListResponse = z.object({ items: z.array(Entity) });
  export type ListResponse = z.infer<typeof ListResponse>;

  export const CreateInput = z.object({
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    primaryDocId: z.string().min(1).optional(),
  });
  export type CreateInput = z.infer<typeof CreateInput>;

  export const UpdateInput = z.object({
    title: z.string().trim().min(1).max(TITLE_MAX),
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  // ---- Operations -------------------------------------------------------
  export const list = async (userId: string): Promise<Entity[]> => {
    return ConversationStorage.list(userId);
  };

  export const get = async (userId: string, id: string): Promise<Entity> => {
    const entity = await ConversationStorage.get(id, userId);
    if (!entity) throw new NotFoundError({ id });
    return entity;
  };

  // Internal lookup used by ChatAgent: given a conversationId (the DO
  // instance name), return the owning userId. Returns null if no row
  // exists. The auth middleware has already verified the caller owns this
  // conversation, so we don't need to re-scope here.
  export const ownerOf = async (id: string): Promise<string | null> =>
    ConversationStorage.ownerOf(id);

  export const create = async (userId: string, input: CreateInput): Promise<Entity> => {
    // Confirm the caller owns the doc they're scoping to. Document.get throws
    // DocumentNotFoundError for both missing rows and rows owned by another
    // user — exactly the right surface for "you can't pin this conversation
    // to that doc". Routes map DocumentNotFoundError → 404.
    if (input.primaryDocId !== undefined) {
      await Document.get(userId, input.primaryDocId);
    }

    return ConversationStorage.create({
      id: crypto.randomUUID(),
      userId,
      title: input.title?.trim() || DEFAULT_TITLE,
      primaryDocId: input.primaryDocId ?? null,
    });
  };

  export const update = async (userId: string, id: string, patch: UpdateInput): Promise<Entity> => {
    const updated = await ConversationStorage.update(id, userId, { title: patch.title.trim() });
    if (!updated) throw new NotFoundError({ id });
    return updated;
  };

  export const remove = async (userId: string, id: string): Promise<void> => {
    // Confirm ownership before touching the DO. We do the same check
    // implicitly inside ConversationStorage.remove, but we want a
    // matching gate before the destroy RPC so we don't accidentally
    // wipe a stranger's chat DO storage.
    await get(userId, id);

    // Destroy the DO's persisted state first. If this fails the D1 row
    // is still present, so the user can retry. The opposite order
    // (delete row, then destroy) would orphan storage on a partial
    // failure.
    await Agent.destroy(id);

    const removed = await ConversationStorage.remove(id, userId);
    if (!removed) throw new NotFoundError({ id });
  };

  // Bump `last_activity_at` so the sidebar reorders. Called from the chat
  // agent on each turn (wired in a follow-up PR). Silent no-op for unknown
  // ids so a turn from a stale DO instance doesn't 500.
  export const touch = async (userId: string, id: string): Promise<void> => {
    await ConversationStorage.update(id, userId, { lastActivityAt: new Date() });
  };
}
