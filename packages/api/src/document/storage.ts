import { Binder } from "../binder/binder";
import type { DocumentRow as BinderDocumentRow } from "../binder/binder-store";
import type { Document } from "./document";

// Document catalog accessor. BinderDO is the only source of truth — D1's
// document-domain tables were dropped in migration 0005. UserId scopes to
// the BinderDO instance (`Binder.require(userId)`).
export namespace DocumentStorage {
  type EntityWithKey = Document.Entity & { userId: string; r2KeyOriginal: string };

  const parseKind = (raw: string): Document.Kind => {
    if (raw === "epub") return raw;
    throw new Error(`Unexpected document.kind value: ${raw}`);
  };

  const parseStatus = (raw: string): Document.Status => {
    if (raw === "uploading" || raw === "processing" || raw === "processed" || raw === "failed") {
      return raw;
    }
    return "failed";
  };

  // Project a BinderDO row + an optional progress snapshot into the
  // user-facing Document.Entity (plus internal-only fields the feature
  // module strips before returning to routes).
  const binderRowToEntity = (
    userId: string,
    row: BinderDocumentRow,
    progressSnapshot: Document.ProgressSnapshot | null,
  ): EntityWithKey => ({
    id: row.documentId,
    userId,
    kind: parseKind(row.kind),
    mimeType: row.mimeType,
    originalFilename: row.originalFilename,
    sizeBytes: row.sizeBytes,
    sha256: row.contentHash,
    title: row.title,
    sensitive: row.sensitive,
    status: parseStatus(row.status),
    errorReason: row.errorReason,
    coverImage: row.coverImage,
    sourceUrl: row.sourceUrl,
    progress: progressSnapshot,
    r2KeyOriginal: row.originalKey,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  export type CreateInput = {
    id: string;
    userId: string;
    kind: Document.Kind;
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    sha256: string;
    title: string;
    sensitive: boolean;
    status: Document.Status;
    r2KeyOriginal: string;
  };

  export const create = async (input: CreateInput): Promise<Document.Entity> => {
    const binder = Binder.require(input.userId);
    const row = await binder.createDocument({
      documentId: input.id,
      kind: input.kind,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sizeBytes: input.sizeBytes,
      contentHash: input.sha256,
      title: input.title,
      sensitive: input.sensitive,
      status: input.status,
      originalKey: input.r2KeyOriginal,
    });
    return projectEntity(binderRowToEntity(input.userId, row, null));
  };

  export const get = async (
    id: string,
    userId: string,
  ): Promise<(Document.Entity & { r2KeyOriginal: string }) | null> => {
    const binder = Binder.require(userId);
    const row = await binder.getDocument(id);
    if (!row) return null;
    const progressRow = await binder.getProgress(id);
    const snapshot = progressRow
      ? {
          sectionKey: progressRow.sectionKey,
          progressPercent: progressRow.progressPercent,
          updatedAt: new Date(progressRow.updatedAt).toISOString(),
        }
      : null;
    const entity = binderRowToEntity(userId, row, snapshot);
    return { ...projectEntity(entity), r2KeyOriginal: entity.r2KeyOriginal };
  };

  export const list = async (userId: string): Promise<Document.Entity[]> => {
    const binder = Binder.require(userId);
    const rows = await binder.listDocuments();
    if (rows.length === 0) return [];
    const progressByDoc = await binder.listProgressByDocuments(rows.map((r) => r.documentId));
    return rows.map((row) => {
      const p = progressByDoc.get(row.documentId);
      const snapshot: Document.ProgressSnapshot | null = p
        ? {
            sectionKey: p.sectionKey,
            progressPercent: p.progressPercent,
            updatedAt: new Date(p.updatedAt).toISOString(),
          }
        : null;
      return projectEntity(binderRowToEntity(userId, row, snapshot));
    });
  };

  // Drop the BinderDO catalog row + cascade child tables. BinderDO's
  // removeDocument also nulls `primary_document_id` on any conversation
  // that referenced this doc — so callers don't need to compose that.
  export const remove = async (id: string, userId: string): Promise<boolean> => {
    const binder = Binder.require(userId);
    const existing = await binder.getDocument(id);
    if (!existing) return false;
    await binder.removeDocument(id);
    return true;
  };

  export type MarkProcessedInput = {
    title: string | null;
    coverImage: string | null;
    manifestKey: string;
  };

  export const markProcessed = async (
    userId: string,
    id: string,
    input: MarkProcessedInput,
  ): Promise<void> => {
    const binder = Binder.require(userId);
    await binder.markDocumentProcessed({
      documentId: id,
      title: input.title,
      coverImage: input.coverImage,
      manifestKey: input.manifestKey,
    });
  };

  export const updateTitle = async (
    id: string,
    userId: string,
    title: string,
  ): Promise<Document.Entity | null> => {
    const binder = Binder.require(userId);
    const updated = await binder.updateDocument({ documentId: id, title });
    if (!updated) return null;
    const progressRow = await binder.getProgress(id);
    const snapshot = progressRow
      ? {
          sectionKey: progressRow.sectionKey,
          progressPercent: progressRow.progressPercent,
          updatedAt: new Date(progressRow.updatedAt).toISOString(),
        }
      : null;
    return projectEntity(binderRowToEntity(userId, updated, snapshot));
  };

  export const markFailed = async (userId: string, id: string, reason: string): Promise<void> => {
    const binder = Binder.require(userId);
    await binder.markDocumentFailed({ documentId: id, reason });
  };

  // Strip internal-only fields (`userId`, `r2KeyOriginal`) before exposing to
  // routes / SDK. The route layer uses `Document.Entity` as the wire type.
  const projectEntity = (entity: EntityWithKey): Document.Entity => ({
    id: entity.id,
    kind: entity.kind,
    mimeType: entity.mimeType,
    originalFilename: entity.originalFilename,
    sizeBytes: entity.sizeBytes,
    sha256: entity.sha256,
    title: entity.title,
    sensitive: entity.sensitive,
    status: entity.status,
    errorReason: entity.errorReason,
    coverImage: entity.coverImage,
    sourceUrl: entity.sourceUrl,
    progress: entity.progress,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
