import { z } from "zod";
import { Binder } from "../binder/binder";
import { Document } from "../document/document";
import { NamedError } from "../utils/error";
import type { ShelfRowWithCount } from "./table";

// User-created tag-style grouping of documents, plus two smart shelves
// derived from reading progress (`smart:reading`, `smart:finished`).
//
// Smart shelves live entirely at the API edge — there are no DB rows for
// them. They are synthesized from `progress` rows joined with `document`
// every read. Reads against a smart id work the same way as a custom one;
// writes against a smart id throw `SmartShelfWriteError`.
//
// Custom shelves are unique by name per user, case-insensitive.
export namespace Shelf {
  // ---- Errors -----------------------------------------------------------
  export const NotFoundError = NamedError.create(
    "ShelfNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  export const NameTakenError = NamedError.create(
    "ShelfNameTakenError",
    z.object({ name: z.string(), message: z.string().optional() }),
  );
  export type NameTakenError = InstanceType<typeof NameTakenError>;

  export const SmartShelfWriteError = NamedError.create(
    "ShelfSmartWriteError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type SmartShelfWriteError = InstanceType<typeof SmartShelfWriteError>;

  export const DocumentNotOnShelfError = NamedError.create(
    "ShelfDocumentNotOnShelfError",
    z.object({
      shelfId: z.string(),
      documentId: z.string(),
      message: z.string().optional(),
    }),
  );
  export type DocumentNotOnShelfError = InstanceType<typeof DocumentNotOnShelfError>;

  // ---- Schemas ----------------------------------------------------------
  // Smart shelf identifiers. The id format ("smart:reading", "smart:finished")
  // is intentional — clients can branch on `kind === "smart"` and use the
  // smartType value, but the id itself is stable and routable.
  export const SmartType = z.enum(["reading", "finished"]);
  export type SmartType = z.infer<typeof SmartType>;

  const SMART_IDS: Record<SmartType, string> = {
    reading: "smart:reading",
    finished: "smart:finished",
  };

  const SMART_NAMES: Record<SmartType, string> = {
    reading: "Currently reading",
    finished: "Finished",
  };

  export const SmartEntity = z
    .object({
      kind: z.literal("smart"),
      id: z.string(),
      smartType: SmartType,
      name: z.string(),
      itemCount: z.number().int().nonnegative(),
    })
    .meta({ ref: "ShelfSmart" });
  export type SmartEntity = z.infer<typeof SmartEntity>;

  export const CustomEntity = z
    .object({
      kind: z.literal("custom"),
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      itemCount: z.number().int().nonnegative(),
      position: z.number().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "ShelfCustom" });
  export type CustomEntity = z.infer<typeof CustomEntity>;

  export const Entity = z
    .discriminatedUnion("kind", [SmartEntity, CustomEntity])
    .meta({ ref: "Shelf" });
  export type Entity = z.infer<typeof Entity>;

  export const ListResponse = z.object({ items: z.array(Entity) });
  export type ListResponse = z.infer<typeof ListResponse>;

  // The reverse-lookup endpoint returns custom shelves only — smart-shelf
  // membership is derivable client-side from the document's own progress
  // field that's already embedded on Document.Entity.
  export const CustomListResponse = z.object({ items: z.array(CustomEntity) });
  export type CustomListResponse = z.infer<typeof CustomListResponse>;

  export const DocumentListResponse = z.object({ items: z.array(Document.Entity) });
  export type DocumentListResponse = z.infer<typeof DocumentListResponse>;

  // ---- Inputs -----------------------------------------------------------
  const NAME_MAX = 80;
  const DESCRIPTION_MAX = 280;

  export const CreateInput = z.object({
    name: z.string().trim().min(1).max(NAME_MAX),
    description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  });
  export type CreateInput = z.infer<typeof CreateInput>;

  export const UpdateInput = z
    .object({
      name: z.string().trim().min(1).max(NAME_MAX).optional(),
      description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
      position: z.number().nullable().optional(),
    })
    .refine(
      (v) => v.name !== undefined || v.description !== undefined || v.position !== undefined,
      { message: "At least one of name, description, or position must be provided" },
    );
  export type UpdateInput = z.infer<typeof UpdateInput>;

  export const ReorderDocumentInput = z.object({
    position: z.number().nullable(),
  });
  export type ReorderDocumentInput = z.infer<typeof ReorderDocumentInput>;

  // ---- Row → Entity mapping ---------------------------------------------
  const toCustomEntity = (row: ShelfRowWithCount): CustomEntity => ({
    kind: "custom",
    id: row.shelfId,
    name: row.name,
    description: row.description,
    itemCount: row.itemCount,
    position: row.position,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  // ---- Operations -------------------------------------------------------
  export const list = async (userId: string): Promise<Entity[]> => {
    const binder = Binder.require(userId);
    const [counts, customRows] = await Promise.all([binder.smartCounts(), binder.listShelves()]);
    return [
      smartShelf("reading", counts.reading),
      smartShelf("finished", counts.finished),
      ...customRows.map(toCustomEntity),
    ];
  };

  export const get = async (userId: string, id: string): Promise<Entity> => {
    const binder = Binder.require(userId);
    const smartType = parseSmartId(id);
    if (smartType) {
      const counts = await binder.smartCounts();
      return smartShelf(smartType, counts[smartType]);
    }
    const row = await binder.getShelf(id);
    if (!row) throw new NotFoundError({ id });
    return toCustomEntity(row);
  };

  export const create = async (userId: string, input: CreateInput): Promise<CustomEntity> => {
    const binder = Binder.require(userId);
    const name = input.name.trim();
    const existing = await binder.findShelfByLowerName(name.toLowerCase());
    if (existing) throw new NameTakenError({ name });

    const row = await binder.createShelf({
      shelfId: crypto.randomUUID(),
      name,
      description: input.description?.trim() || null,
    });
    return toCustomEntity(row);
  };

  export const update = async (
    userId: string,
    id: string,
    patch: UpdateInput,
  ): Promise<CustomEntity> => {
    requireCustom(id);
    const binder = Binder.require(userId);

    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      const existing = await binder.findShelfByLowerName(trimmed.toLowerCase());
      if (existing && existing.shelfId !== id) throw new NameTakenError({ name: trimmed });
    }

    // null clears, undefined leaves alone, string sets — same convention as
    // Highlight.update.
    const description =
      patch.description === undefined
        ? undefined
        : patch.description === null
          ? null
          : patch.description.trim() || null;

    const updated = await binder.updateShelf({
      shelfId: id,
      name: patch.name?.trim(),
      description,
      position: patch.position,
    });
    if (!updated) throw new NotFoundError({ id });
    return toCustomEntity(updated);
  };

  export const remove = async (userId: string, id: string): Promise<void> => {
    requireCustom(id);
    const removed = await Binder.require(userId).removeShelf(id);
    if (!removed) throw new NotFoundError({ id });
  };

  export const listDocuments = async (userId: string, id: string): Promise<Document.Entity[]> => {
    const binder = Binder.require(userId);
    const smartType = parseSmartId(id);
    if (smartType) {
      const rows = await binder.smartDocuments(smartType);
      return rows.map(Document.fromBinderRow);
    }

    const owned = await binder.shelfExists(id);
    if (!owned) throw new NotFoundError({ id });
    const rows = await binder.listShelfDocuments(id);
    return rows.map(Document.fromBinderRow);
  };

  export const addDocument = async (
    userId: string,
    id: string,
    documentId: string,
  ): Promise<void> => {
    requireCustom(id);
    const binder = Binder.require(userId);

    const owned = await binder.shelfExists(id);
    if (!owned) throw new NotFoundError({ id });
    // Confirm the doc exists and is owned by the caller. Document.get throws
    // DocumentNotFoundError for both missing rows and rows owned by another
    // user — exactly the right surface for "you can't add this".
    await Document.get(userId, documentId);

    await binder.addShelfDocument({ shelfId: id, documentId });
  };

  export const removeDocument = async (
    userId: string,
    id: string,
    documentId: string,
  ): Promise<void> => {
    requireCustom(id);
    const binder = Binder.require(userId);
    const owned = await binder.shelfExists(id);
    if (!owned) throw new NotFoundError({ id });

    const removed = await binder.removeShelfDocument({ shelfId: id, documentId });
    if (!removed) throw new DocumentNotOnShelfError({ shelfId: id, documentId });
  };

  export const reorderDocument = async (
    userId: string,
    id: string,
    documentId: string,
    input: ReorderDocumentInput,
  ): Promise<void> => {
    requireCustom(id);
    const binder = Binder.require(userId);
    const owned = await binder.shelfExists(id);
    if (!owned) throw new NotFoundError({ id });

    const updated = await binder.updateShelfMembershipPosition({
      shelfId: id,
      documentId,
      position: input.position,
    });
    if (!updated) throw new DocumentNotOnShelfError({ shelfId: id, documentId });
  };

  // Reverse lookup used by the book-detail "ON SHELVES" row. Smart shelves
  // are intentionally omitted — clients derive those from the document's
  // own progress field.
  export const listForDocument = async (
    userId: string,
    documentId: string,
  ): Promise<CustomEntity[]> => {
    await Document.get(userId, documentId);
    const rows = await Binder.require(userId).shelvesForDocument(documentId);
    return rows.map(toCustomEntity);
  };

  // ---- Helpers (feature-local) ------------------------------------------
  const smartShelf = (smartType: SmartType, itemCount: number): SmartEntity => ({
    kind: "smart",
    id: SMART_IDS[smartType],
    smartType,
    name: SMART_NAMES[smartType],
    itemCount,
  });

  const parseSmartId = (id: string): SmartType | null => {
    if (id === SMART_IDS.reading) return "reading";
    if (id === SMART_IDS.finished) return "finished";
    return null;
  };

  const requireCustom = (id: string): void => {
    if (parseSmartId(id)) {
      throw new SmartShelfWriteError({
        id,
        message: "Smart shelves cannot be modified",
      });
    }
  };
}
