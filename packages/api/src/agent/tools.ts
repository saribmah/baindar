import { tool } from "ai";
import { z } from "zod";
import { Ai } from "../ai/ai";
import { Document } from "../document/document";
import { Highlight } from "../highlight/highlight";
import { Note } from "../note/note";

// Typed tools the chat agent can call. Each tool's `execute` runs inside
// the Instance frame that ChatAgent.onChatMessage already provides — so
// existing storage modules (which read `Instance.db` from
// AsyncLocalStorage) work unchanged. The userId is captured from
// ChatAgent's DO storage; tools NEVER accept user_id from the model
// (PRD §14).
//
// Output sizes are bounded so a single tool call can't blow the model
// context budget. See the trim* helpers below.

// Per-tool output caps. The model context budget is the bottleneck — even
// at 200k tokens a runaway tool can wipe most of it.
const SNIPPET_CHAR_LIMIT = 600;
const CHUNK_TEXT_CHAR_LIMIT = 4_000;
const NOTE_BODY_CHAR_LIMIT = 1_000;
const HIGHLIGHT_SNIPPET_CHAR_LIMIT = 600;
const SUMMARY_CHAR_LIMIT = 2_000;
const LIST_ITEM_LIMIT_DEFAULT = 50;
const LIST_ITEM_LIMIT_MAX = 100;
const SEARCH_LIMIT_DEFAULT = 8;
const SEARCH_LIMIT_MAX = 20;
const READ_LIMIT_DEFAULT = 6;
const READ_LIMIT_MAX = 20;

const truncate = (raw: string, limit: number): string =>
  raw.length <= limit ? raw : `${raw.slice(0, limit)}…`;

export const buildAgentTools = ({ userId }: { userId: string }) => {
  return {
    list_documents: tool({
      description:
        "List documents in the user's binder, ordered by most recent. Use this to discover what kinds of documents the user has and to look up document_id values by title before calling search_document or read_section.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(LIST_ITEM_LIMIT_MAX)
          .optional()
          .describe(`Max items to return. Defaults to ${LIST_ITEM_LIMIT_DEFAULT}.`),
      }),
      execute: async ({ limit }) => {
        const docs = await Document.list(userId);
        return docs.slice(0, limit ?? LIST_ITEM_LIMIT_DEFAULT).map((d) => ({
          id: d.id,
          title: d.title,
          kind: d.kind,
          status: d.status,
          createdAt: d.createdAt,
        }));
      },
    }),

    search_document: tool({
      description:
        "Lexical search WITHIN a single document. Returns ranked snippets matching the query, with section_key + chunk_index pointers usable by read_section. Use when the user asks something specific about one document.",
      inputSchema: z.object({
        document_id: z.string().min(1),
        query: z.string().trim().min(1).max(500),
        limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
      }),
      execute: async ({ document_id, query, limit }) => {
        const items = await Ai.search(userId, {
          documentId: document_id,
          query,
          limit: limit ?? SEARCH_LIMIT_DEFAULT,
        });
        return items.map((h) => ({
          documentId: h.documentId,
          documentTitle: h.documentTitle,
          sectionKey: h.sectionKey,
          sectionTitle: h.sectionTitle,
          chunkIndex: h.chunkIndex,
          score: h.score,
          snippet: truncate(h.snippet, SNIPPET_CHAR_LIMIT),
        }));
      },
    }),

    search_binder: tool({
      description:
        "Lexical search ACROSS the entire binder. Returns ranked snippets joined to document title + kind. Use this for cross-document questions ('find my Apple receipt'). Set `kind` when the user clearly asks about a specific document type (discover values from list_documents). `exclude_document_id` / `exclude_section_key` skip results from a known scope.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(500),
        kind: z.string().min(1).max(64).optional(),
        exclude_document_id: z.string().min(1).optional(),
        exclude_section_key: z.string().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
      }),
      execute: async ({ query, kind, exclude_document_id, exclude_section_key, limit }) => {
        const items = await Ai.search(userId, {
          query,
          kind,
          excludeDocumentId: exclude_document_id,
          excludeSectionKey: exclude_section_key,
          limit: limit ?? SEARCH_LIMIT_DEFAULT,
        });
        return items.map((h) => ({
          documentId: h.documentId,
          documentTitle: h.documentTitle,
          kind: h.kind,
          sectionKey: h.sectionKey,
          sectionTitle: h.sectionTitle,
          chunkIndex: h.chunkIndex,
          score: h.score,
          snippet: truncate(h.snippet, SNIPPET_CHAR_LIMIT),
        }));
      },
    }),

    read_section: tool({
      description:
        "Read a section's chunks in order. Use after search_document/search_binder to read surrounding context, or after a MessageReference points the user to a specific section. `offset` and `limit` are chunk indices; default reads the first 6 chunks.",
      inputSchema: z.object({
        document_id: z.string().min(1),
        section_key: z.string().min(1).max(200),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().min(1).max(READ_LIMIT_MAX).optional(),
      }),
      execute: async ({ document_id, section_key, offset, limit }) => {
        const result = await Ai.read(userId, {
          documentId: document_id,
          sectionKey: section_key,
          offset,
          limit: limit ?? READ_LIMIT_DEFAULT,
        });
        return {
          documentId: result.documentId,
          sectionKey: result.sectionKey,
          chunks: result.chunks.map((c) => ({
            sectionKey: c.sectionKey,
            sectionTitle: c.sectionTitle,
            chunkIndex: c.chunkIndex,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
            text: truncate(c.text, CHUNK_TEXT_CHAR_LIMIT),
          })),
        };
      },
    }),

    list_notes: tool({
      description:
        "List the user's notes across the binder, most recent first. Optionally scope to one document_id. Notes are short user-authored annotations; the body field holds the text.",
      inputSchema: z.object({
        document_id: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(LIST_ITEM_LIMIT_MAX).optional(),
      }),
      execute: async ({ document_id, limit }) => {
        const notes = await Note.listAll(userId, {
          documentId: document_id,
          limit: limit ?? LIST_ITEM_LIMIT_DEFAULT,
        });
        return notes.map((n) => ({
          id: n.id,
          documentId: n.documentId,
          sectionKey: n.sectionKey,
          highlightId: n.highlightId,
          body: truncate(n.body, NOTE_BODY_CHAR_LIMIT),
          createdAt: n.createdAt,
        }));
      },
    }),

    list_highlights: tool({
      description:
        "List the user's highlights across the binder, most recent first. Optionally scope to one document_id. The textSnippet field holds the highlighted passage.",
      inputSchema: z.object({
        document_id: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(LIST_ITEM_LIMIT_MAX).optional(),
      }),
      execute: async ({ document_id, limit }) => {
        const highlights = await Highlight.listAll(userId, {
          documentId: document_id,
          limit: limit ?? LIST_ITEM_LIMIT_DEFAULT,
        });
        return highlights.map((h) => ({
          id: h.id,
          documentId: h.documentId,
          sectionKey: h.sectionKey,
          textSnippet: truncate(h.textSnippet, HIGHLIGHT_SNIPPET_CHAR_LIMIT),
          color: h.color,
          createdAt: h.createdAt,
        }));
      },
    }),

    get_summary: tool({
      description:
        "Fetch a cached summary for a section or whole document, or generate one on demand. Use BEFORE reading long passages so the user gets a concise overview. For target_type='section', target_key is the sectionKey (e.g. 'epub:section:6'). For target_type='document', target_key must equal document_id.",
      inputSchema: z.object({
        document_id: z.string().min(1),
        target_type: z.enum(["section", "document"]),
        target_key: z.string().min(1).max(200),
        force: z.boolean().optional(),
      }),
      execute: async ({ document_id, target_type, target_key, force }) => {
        try {
          const result = await Ai.summarize(userId, {
            documentId: document_id,
            targetType: target_type,
            targetKey: target_key,
            force,
          });
          return {
            status: "ok" as const,
            documentId: result.documentId,
            targetType: result.targetType,
            targetKey: result.targetKey,
            cached: result.cached,
            summary: truncate(result.summary, SUMMARY_CHAR_LIMIT),
          };
        } catch (e) {
          // Surface domain failures as recoverable tool errors so the model
          // can fall back to search_document + read_section instead of
          // aborting the turn.
          const err = e as Error;
          return {
            status: "error" as const,
            name: err.name,
            message: err.message,
          };
        }
      },
    }),

    expand_query: tool({
      description:
        "Expand a concept-style query into related search terms. Use ONLY after an empty or weak lexical search to discover phrasings the user might have used. STUB IN v1 — currently returns 'not_implemented'; Phase 7 wires the real path.",
      inputSchema: z.object({
        original_query: z.string().trim().min(1).max(500),
      }),
      execute: async () => {
        return {
          status: "not_implemented" as const,
          message:
            "expand_query is not yet available. Try alternate phrasings yourself or rely on search_binder/search_document directly.",
        };
      },
    }),
  };
};
