import { tool } from "ai";
import { z } from "zod";
import type { RuntimeEnv } from "../app/context";
import { createDb } from "../db/db";
import { Document } from "../document/document";
import { Highlight } from "../highlight/highlight";
import { Instance } from "../instance";
import { Note } from "../note/note";

// Tools the chat agent can call. Each tool's `execute` runs inside
// `Instance.provide(...)` so existing storage modules — which read
// `Instance.db` from AsyncLocalStorage — work unchanged. The agent runs
// inside a Durable Object, which has no Hono request context of its own,
// so we hand-build a synthetic `RequestContext` from the agent's env and
// the userId (which equals the DO instance name; `requireOwnAgentInstance`
// guarantees that match).
export const buildAgentTools = ({ userId, env }: { userId: string; env: RuntimeEnv }) => {
  const db = createDb(env);
  const auth = {
    isAuthenticated: true as const,
    userId,
    // The full session user record isn't available here; tools that need it
    // would need to fetch via UserStorage. None of the listing tools do.
    user: null,
    authMethod: "session" as const,
  };
  const withInstance = <T>(fn: () => Promise<T>): Promise<T> =>
    Instance.provide({ auth, env, db }, fn);

  return {
    listDocuments: tool({
      description:
        "List documents in the user's binder, ordered by most recent. Use this to find what the user has uploaded before answering questions about specific items.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max items to return. Defaults to 50."),
      }),
      execute: ({ limit }) =>
        withInstance(async () => {
          const docs = await Document.list(userId);
          return docs.slice(0, limit ?? 50).map((d) => ({
            id: d.id,
            title: d.title,
            kind: d.kind,
            status: d.status,
            createdAt: d.createdAt,
          }));
        }),
    }),

    listNotes: tool({
      description:
        "List the user's notes across the binder, most recent first. Optionally scope to one documentId. Notes are short user-authored annotations; the body field holds the actual note text.",
      inputSchema: z.object({
        documentId: z
          .string()
          .optional()
          .describe("If set, return only notes attached to this document."),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: ({ documentId, limit }) =>
        withInstance(async () => {
          const notes = await Note.listAll(userId, { documentId, limit });
          return notes.map((n) => ({
            id: n.id,
            documentId: n.documentId,
            sectionKey: n.sectionKey,
            highlightId: n.highlightId,
            body: n.body,
            createdAt: n.createdAt,
          }));
        }),
    }),

    listHighlights: tool({
      description:
        "List the user's highlights across the binder, most recent first. Optionally scope to one documentId. The textSnippet field holds the highlighted passage.",
      inputSchema: z.object({
        documentId: z
          .string()
          .optional()
          .describe("If set, return only highlights from this document."),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: ({ documentId, limit }) =>
        withInstance(async () => {
          const highlights = await Highlight.listAll(userId, { documentId, limit });
          return highlights.map((h) => ({
            id: h.id,
            documentId: h.documentId,
            sectionKey: h.sectionKey,
            textSnippet: h.textSnippet,
            color: h.color,
            createdAt: h.createdAt,
          }));
        }),
    }),
  };
};
