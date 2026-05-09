import { z } from "zod";
import { Binder } from "../binder/binder";
import { Document } from "../document/document";
import type { ProgressRow } from "./table";

// Per-user reading state for a document. Type-agnostic across formats:
// `sectionKey` ties the row to a section in the document's manifest, and
// `progressPercent` carries the high-level "how much have you read" signal
// for dashboards. `position` is an optional within-section offset that
// formats can populate when they have one (text-content formats use char
// offsets; future raster formats can extend the shape).
//
// Updates are upserts — there's only ever one row per (user, document).
export namespace Progress {
  // ---- Schemas ----------------------------------------------------------
  export const Position = z
    .object({
      offset: z.number().int().nonnegative().optional(),
    })
    .meta({ ref: "ProgressPosition" });
  export type Position = z.infer<typeof Position>;

  export const Entity = z
    .object({
      documentId: z.string(),
      sectionKey: z.string().min(1),
      position: Position.nullable(),
      progressPercent: z.number().min(0).max(1).nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "Progress" });
  export type Entity = z.infer<typeof Entity>;

  export const UpsertInput = z.object({
    sectionKey: z.string().min(1).max(200),
    position: Position.optional(),
    progressPercent: z.number().min(0).max(1).optional(),
  });
  export type UpsertInput = z.infer<typeof UpsertInput>;

  // ---- Row → Entity mapping ---------------------------------------------
  // BinderDO returns position as a generic JSON object; narrow it.
  const toPosition = (raw: ProgressRow["position"]): Position | null => {
    if (raw === null) return null;
    const offset = raw["offset"];
    return typeof offset === "number" ? { offset } : {};
  };

  const toEntity = (row: ProgressRow): Entity => ({
    documentId: row.documentId,
    sectionKey: row.sectionKey,
    position: toPosition(row.position),
    progressPercent: row.progressPercent,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  // ---- Operations -------------------------------------------------------
  export const upsert = async (
    userId: string,
    documentId: string,
    input: UpsertInput,
  ): Promise<Entity> => {
    // Confirm ownership of the document. Missing rows / cross-user reads
    // bubble up as DocumentNotFoundError, same as elsewhere.
    await Document.get(userId, documentId);

    const row = await Binder.require(userId).upsertProgress({
      documentId,
      sectionKey: input.sectionKey,
      position: input.position ?? null,
      progressPercent: input.progressPercent ?? null,
    });
    return toEntity(row);
  };
}
