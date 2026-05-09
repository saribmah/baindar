import { z } from "zod";
import { Binder } from "../binder/binder";
import { Document } from "../document/document";
import { NamedError } from "../utils/error";
import type { HighlightRow } from "./table";

// Text-anchored colour overlays a user paints onto a document. A highlight
// only carries selection + colour. Free-form thoughts about the highlight
// (or the document overall) live in the sibling `Note` feature, which
// optionally points back at a highlight.
//
// Position is type-agnostic: every highlight has a `sectionKey` (which
// section in the document's manifest) and a `position` payload owned by
// the format. For all current text-content formats the position is a
// `{ offsetStart, offsetEnd }` pair over the section's canonical `.txt`
// payload in R2.
export namespace Highlight {
  // ---- Errors -----------------------------------------------------------
  export const NotFoundError = NamedError.create(
    "HighlightNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  // ---- Schemas ----------------------------------------------------------
  export const Color = z.enum(["pink", "yellow", "green", "blue", "purple"]);
  export type Color = z.infer<typeof Color>;

  // Hard-cap snippet length so a malicious caller can't pin a huge blob of
  // text into the row. Picked to comfortably cover one chapter page worth
  // of selection.
  const MAX_SNIPPET_CHARS = 4_000;

  export const Position = z
    .object({
      offsetStart: z.number().int().nonnegative(),
      offsetEnd: z.number().int().nonnegative(),
    })
    .refine((v) => v.offsetStart <= v.offsetEnd, {
      message: "offsetStart must be <= offsetEnd",
      path: ["offsetEnd"],
    })
    .meta({ ref: "HighlightPosition" });
  export type Position = z.infer<typeof Position>;

  export const Entity = z
    .object({
      id: z.string(),
      documentId: z.string(),
      sectionKey: z.string(),
      position: Position,
      textSnippet: z.string(),
      color: Color,
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "Highlight" });
  export type Entity = z.infer<typeof Entity>;

  export const ListResponse = z.object({ items: z.array(Entity) });
  export type ListResponse = z.infer<typeof ListResponse>;

  export const CreateInput = z.object({
    documentId: z.string().min(1),
    sectionKey: z.string().min(1).max(200),
    position: Position,
    textSnippet: z.string().min(1).max(MAX_SNIPPET_CHARS),
    color: Color,
  });
  export type CreateInput = z.infer<typeof CreateInput>;

  export const UpdateInput = z.object({
    color: Color,
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const ListQuery = z.object({
    documentId: z.string().min(1),
    sectionKey: z.string().min(1).max(200).optional(),
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

  // ---- Row → Entity mapping ---------------------------------------------
  // BinderDO returns a generic-JSON `position`; narrow it to the highlight
  // shape. Falls back to a zero-length anchor on unexpected payloads —
  // defensive only; we always write the right shape.
  const parseColor = (raw: string): Color => {
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

  const toPosition = (raw: HighlightRow["position"]): Position => {
    const start = raw["offsetStart"];
    const end = raw["offsetEnd"];
    if (typeof start === "number" && typeof end === "number") {
      return { offsetStart: start, offsetEnd: end };
    }
    return { offsetStart: 0, offsetEnd: 0 };
  };

  const toEntity = (row: HighlightRow): Entity => ({
    id: row.highlightId,
    documentId: row.documentId,
    sectionKey: row.sectionKey,
    position: toPosition(row.position),
    textSnippet: row.textSnippet,
    color: parseColor(row.color),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  // ---- Operations -------------------------------------------------------
  export const create = async (userId: string, input: CreateInput): Promise<Entity> => {
    // Confirm the document exists and is owned by the caller. Document.get
    // throws NotFoundError for both missing rows and rows owned by another
    // user, which is the right behaviour to surface.
    await Document.get(userId, input.documentId);

    const row = await Binder.require(userId).createHighlight({
      highlightId: crypto.randomUUID(),
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      position: input.position,
      textSnippet: input.textSnippet,
      color: input.color,
    });
    return toEntity(row);
  };

  export const list = async (userId: string, query: ListQuery): Promise<Entity[]> => {
    // Ownership check via Document.get: same NotFoundError semantics as
    // above. Avoids returning an empty list for an unauthorised request.
    await Document.get(userId, query.documentId);
    const rows = await Binder.require(userId).listHighlights({
      documentId: query.documentId,
      sectionKey: query.sectionKey,
    });
    return rows.map(toEntity);
  };

  export const listAll = async (userId: string, query: ListAllQuery): Promise<Entity[]> => {
    const rows = await Binder.require(userId).listHighlightsAll({
      documentId: query.documentId,
      limit: query.limit,
    });
    return rows.map(toEntity);
  };

  export const get = async (userId: string, id: string): Promise<Entity> => {
    const row = await Binder.require(userId).getHighlight(id);
    if (!row) throw new NotFoundError({ id });
    return toEntity(row);
  };

  export const update = async (userId: string, id: string, patch: UpdateInput): Promise<Entity> => {
    const row = await Binder.require(userId).updateHighlight({
      highlightId: id,
      color: patch.color,
    });
    if (!row) throw new NotFoundError({ id });
    return toEntity(row);
  };

  export const remove = async (userId: string, id: string): Promise<void> => {
    const removed = await Binder.require(userId).removeHighlight(id);
    if (!removed) throw new NotFoundError({ id });
  };
}
