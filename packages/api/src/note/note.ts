import { z } from "zod";
import { Binder } from "../binder/binder";
import { Document } from "../document/document";
import { Highlight } from "../highlight/highlight";
import { NamedError } from "../utils/error";
import type { NoteRow } from "./table";

// Free-form text the user attaches to a document. A note is conceptually
// distinct from a highlight: highlights mark a span of text, notes carry
// the user's words. The two are decoupled so a user can:
//   - write a thought about the document with no anchor (document-level
//     note: `sectionKey` and `highlightId` both null),
//   - pin a thought to a section (`sectionKey` set, `highlightId` null),
//   - comment on a specific highlight (`highlightId` set; `sectionKey`
//     mirrors the highlight's section so section-scoped reads pick it up).
//
// "Comment on a highlight" is two round trips: create the highlight, then
// create the note with the returned `highlightId`. Cascade on the FK means
// deleting the highlight removes the comment.
export namespace Note {
  // ---- Errors -----------------------------------------------------------
  export const NotFoundError = NamedError.create(
    "NoteNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  // Raised when a caller tries to attach a note to a highlight that lives
  // on a different document than the one the note targets. This would
  // otherwise create an orphan-by-confusion: cascade on highlight delete
  // wouldn't reflect the document the note claims to belong to.
  export const HighlightDocumentMismatchError = NamedError.create(
    "NoteHighlightDocumentMismatchError",
    z.object({
      highlightId: z.string(),
      noteDocumentId: z.string(),
      highlightDocumentId: z.string(),
      message: z.string().optional(),
    }),
  );
  export type HighlightDocumentMismatchError = InstanceType<typeof HighlightDocumentMismatchError>;

  // ---- Schemas ----------------------------------------------------------
  // Same hard cap as the legacy combined model. A note is meant for
  // user prose, not document re-pasting.
  const MAX_BODY_CHARS = 10_000;

  export const Entity = z
    .object({
      id: z.string(),
      documentId: z.string(),
      sectionKey: z.string().nullable(),
      highlightId: z.string().nullable(),
      body: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "Note" });
  export type Entity = z.infer<typeof Entity>;

  export const ListResponse = z.object({ items: z.array(Entity) });
  export type ListResponse = z.infer<typeof ListResponse>;

  export const CreateInput = z.object({
    documentId: z.string().min(1),
    sectionKey: z.string().min(1).max(200).optional(),
    highlightId: z.string().min(1).optional(),
    body: z.string().min(1).max(MAX_BODY_CHARS),
  });
  export type CreateInput = z.infer<typeof CreateInput>;

  export const UpdateInput = z.object({
    body: z.string().min(1).max(MAX_BODY_CHARS),
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  // `unanchored: true` returns notes with no `sectionKey` and no
  // `highlightId` — i.e. document-level notes only. Combined with the
  // other filters, callers can ask for "all notes on doc X", "notes in
  // section Y", "comments on highlight Z", or "doc-level notes only".
  export const ListQuery = z.object({
    documentId: z.string().min(1),
    sectionKey: z.string().min(1).max(200).optional(),
    highlightId: z.string().min(1).optional(),
    unanchored: z.boolean().optional(),
  });
  export type ListQuery = z.infer<typeof ListQuery>;

  // Corpus-wide list across the user's full binder. Used by the chat agent's
  // listing tools where there is no parent document scope. Distinct from
  // `list` (which requires a documentId) so route-level callers keep their
  // ownership-via-Document.get check.
  export const ListAllQuery = z.object({
    documentId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  });
  export type ListAllQuery = z.infer<typeof ListAllQuery>;

  const toEntity = (row: NoteRow): Entity => ({
    id: row.noteId,
    documentId: row.documentId,
    sectionKey: row.sectionKey,
    highlightId: row.highlightId,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  // ---- Operations -------------------------------------------------------
  export const create = async (userId: string, input: CreateInput): Promise<Entity> => {
    // Document ownership check up front: same NotFoundError semantics as
    // every other feature that scopes by user via the parent document.
    await Document.get(userId, input.documentId);

    let sectionKey = input.sectionKey ?? null;
    if (input.highlightId !== undefined) {
      const parent = await Highlight.get(userId, input.highlightId);
      if (parent.documentId !== input.documentId) {
        throw new HighlightDocumentMismatchError({
          highlightId: input.highlightId,
          noteDocumentId: input.documentId,
          highlightDocumentId: parent.documentId,
        });
      }
      // Mirror the highlight's section onto the note. Keeps section-scoped
      // reads cheap (one index hit) and prevents the note from drifting
      // out of sync if the caller forgets to pass it.
      sectionKey = parent.sectionKey;
    }

    const row = await Binder.require(userId).createNote({
      noteId: crypto.randomUUID(),
      documentId: input.documentId,
      sectionKey,
      highlightId: input.highlightId ?? null,
      body: input.body,
    });
    return toEntity(row);
  };

  export const list = async (userId: string, query: ListQuery): Promise<Entity[]> => {
    await Document.get(userId, query.documentId);
    const rows = await Binder.require(userId).listNotes({
      documentId: query.documentId,
      sectionKey: query.sectionKey,
      highlightId: query.highlightId,
      unanchored: query.unanchored,
    });
    return rows.map(toEntity);
  };

  export const listAll = async (userId: string, query: ListAllQuery): Promise<Entity[]> => {
    const rows = await Binder.require(userId).listNotesAll({
      documentId: query.documentId,
      limit: query.limit,
    });
    return rows.map(toEntity);
  };

  export const get = async (userId: string, id: string): Promise<Entity> => {
    const row = await Binder.require(userId).getNote(id);
    if (!row) throw new NotFoundError({ id });
    return toEntity(row);
  };

  export const update = async (userId: string, id: string, patch: UpdateInput): Promise<Entity> => {
    const row = await Binder.require(userId).updateNote({ noteId: id, body: patch.body });
    if (!row) throw new NotFoundError({ id });
    return toEntity(row);
  };

  export const remove = async (userId: string, id: string): Promise<void> => {
    const removed = await Binder.require(userId).removeNote(id);
    if (!removed) throw new NotFoundError({ id });
  };
}
