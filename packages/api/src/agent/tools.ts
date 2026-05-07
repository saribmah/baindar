import { tool } from "ai";
import { z } from "zod";
import { Document } from "../document/document";
import { Highlight } from "../highlight/highlight";
import { Note } from "../note/note";
import { Sandbox } from "../sandbox/sandbox";

// Tools the chat agent can call. Each tool's `execute` runs inside the
// Instance frame that ChatAgent.onChatMessage already provides — so
// existing storage modules (which read `Instance.db` from
// AsyncLocalStorage) work unchanged. The userId is derived from the
// conversation row in D1 (the DO instance name is the conversationId,
// not the userId).
export const buildAgentTools = ({ userId }: { userId: string }) => {
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
      execute: async ({ limit }) => {
        const docs = await Document.list(userId);
        return docs.slice(0, limit ?? 50).map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          status: d.status,
          createdAt: d.createdAt,
        }));
      },
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
      execute: async ({ documentId, limit }) => {
        const notes = await Note.listAll(userId, { documentId, limit });
        return notes.map((n) => ({
          id: n.id,
          documentId: n.documentId,
          sectionKey: n.sectionKey,
          highlightId: n.highlightId,
          body: n.body,
          createdAt: n.createdAt,
        }));
      },
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
      execute: async ({ documentId, limit }) => {
        const highlights = await Highlight.listAll(userId, { documentId, limit });
        return highlights.map((h) => ({
          id: h.id,
          documentId: h.documentId,
          sectionKey: h.sectionKey,
          textSnippet: h.textSnippet,
          color: h.color,
          createdAt: h.createdAt,
        }));
      },
    }),

    runBash: tool({
      description:
        "Run bash in the user's prepared Linux sandbox. The user's document R2 prefix is mounted read-only at /mnt/baindar/documents. Use listDocuments first; each document id is the directory name under /mnt/baindar/documents/{documentId}. Use rg, find, jq, cat/head, and Python heredocs for document search and analysis.",
      inputSchema: z.object({
        description: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .describe(
            'Required 3-4 word, user-facing description of the command intent. This is shown in the UI, so avoid shell syntax. Example: "Search lease terms".',
          ),
        command: z
          .string()
          .min(1)
          .max(12_000)
          .describe(
            "Bash command or script body. Write useful results to stdout. Prefer processed content/*.txt and manifest.json before raw originals.",
          ),
        timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
      }),
      execute: async (input) => Sandbox.runBash(userId, input),
    }),
  };
};
