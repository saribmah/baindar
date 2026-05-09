import { z } from "zod";
import { Binder } from "../binder/binder";
import { NamedError } from "../utils/error";
import { DocumentAssetStore } from "./asset-store";
import type { DocumentWithProgressRow } from "./binder-table";
import { Epub } from "./formats/epub/epub";
import { detectFormat } from "./processing/detect";
import { DocumentDeletion } from "./processing/deletion-steps";
import { Processor } from "./processing/processor";

// User-visible binder primitive. One row per uploaded file. Format-specific
// content (chapters, page text, structured metadata) lives in R2 under the
// document's prefix and is described by `manifest.json`. The reader API
// surface is type-agnostic: `getManifest` / `getSectionHtml` / `getSectionText`
// work the same way regardless of `kind`.
//
// New formats are reintroduced one at a time via `.agents/add-format.md`.
export namespace Document {
  // ---- Errors -----------------------------------------------------------
  export const NotFoundError = NamedError.create(
    "DocumentNotFoundError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type NotFoundError = InstanceType<typeof NotFoundError>;

  export const NotProcessedError = NamedError.create(
    "DocumentNotProcessedError",
    z.object({ id: z.string(), status: z.string(), message: z.string().optional() }),
  );
  export type NotProcessedError = InstanceType<typeof NotProcessedError>;

  export const ManifestMissingError = NamedError.create(
    "DocumentManifestMissingError",
    z.object({ id: z.string(), message: z.string().optional() }),
  );
  export type ManifestMissingError = InstanceType<typeof ManifestMissingError>;

  export const SectionNotFoundError = NamedError.create(
    "DocumentSectionNotFoundError",
    z.object({
      id: z.string(),
      order: z.number().int(),
      message: z.string().optional(),
    }),
  );
  export type SectionNotFoundError = InstanceType<typeof SectionNotFoundError>;

  export const UploadTooLargeError = NamedError.create(
    "DocumentUploadTooLargeError",
    z.object({ sizeBytes: z.number(), limitBytes: z.number(), message: z.string().optional() }),
  );
  export type UploadTooLargeError = InstanceType<typeof UploadTooLargeError>;

  export const UploadEmptyError = NamedError.create(
    "DocumentUploadEmptyError",
    z.object({ message: z.string().optional() }),
  );
  export type UploadEmptyError = InstanceType<typeof UploadEmptyError>;

  export const UnsupportedFormatError = NamedError.create(
    "DocumentUnsupportedFormatError",
    z.object({
      mimeType: z.string().optional(),
      filename: z.string().optional(),
      message: z.string().optional(),
    }),
  );
  export type UnsupportedFormatError = InstanceType<typeof UnsupportedFormatError>;

  // ---- Schemas ----------------------------------------------------------
  export const Kind = z.enum(["epub"]);
  export type Kind = z.infer<typeof Kind>;

  export const Status = z.enum(["uploading", "processing", "processed", "failed"]);
  export type Status = z.infer<typeof Status>;

  // Embedded reading-progress snapshot. Lives on Document because every
  // list/get response wants it; the upsert path lives in the Progress
  // feature. Null when the caller hasn't opened this document yet.
  export const ProgressSnapshot = z
    .object({
      sectionKey: z.string(),
      progressPercent: z.number().min(0).max(1).nullable(),
      updatedAt: z.string(),
    })
    .meta({ ref: "DocumentProgress" });
  export type ProgressSnapshot = z.infer<typeof ProgressSnapshot>;

  export const Entity = z
    .object({
      id: z.string(),
      kind: Kind,
      mimeType: z.string(),
      originalFilename: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      sha256: z.string(),
      title: z.string(),
      sensitive: z.boolean(),
      status: Status,
      errorReason: z.string().nullable(),
      coverImage: z.string().nullable(),
      sourceUrl: z.string().nullable(),
      progress: ProgressSnapshot.nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .meta({ ref: "Document" });
  export type Entity = z.infer<typeof Entity>;

  export const StatusPayload = z
    .object({
      id: z.string(),
      status: Status,
      errorReason: z.string().nullable(),
    })
    .meta({ ref: "DocumentStatus" });
  export type StatusPayload = z.infer<typeof StatusPayload>;

  export const ListResponse = z.object({ items: z.array(Entity) });
  export type ListResponse = z.infer<typeof ListResponse>;

  export const UpdateInput = z.object({
    title: z.string().trim().min(1).max(200),
  });
  export type UpdateInput = z.infer<typeof UpdateInput>;

  // ---- Manifest ---------------------------------------------------------
  // Type-agnostic per-section descriptor surfaced from manifest.json. The
  // reader navigates by `order`; `sectionKey` ties a section to its
  // highlight/progress rows; `files.html` and `files.text` are R2 keys
  // (relative to the document prefix's `content/` folder) that the
  // section-stream endpoints read from.
  export const SectionSummary = z
    .object({
      sectionKey: z.string(),
      order: z.number().int().nonnegative(),
      title: z.string(),
      wordCount: z.number().int().nonnegative(),
      // Format-specific reading-order signal. EPUB exposes spine `linear=no`
      // items here; non-paginated formats default to true.
      linear: z.boolean(),
      // Original-format href (e.g. EPUB OPF-relative chapter href). The
      // reader uses this to map TOC `fileHref` back to a section order.
      // Empty string when the format has no native href concept.
      href: z.string(),
      files: z.object({
        html: z.string(),
        text: z.string(),
      }),
    })
    .meta({ ref: "DocumentSectionSummary" });
  export type SectionSummary = z.infer<typeof SectionSummary>;

  // Per-format processor identity, baked into the manifest so consumers can
  // tell which pipeline rendered a document and at which version. Useful when
  // we add reprocess flows or need to invalidate manifests produced by buggy
  // older processors.
  export const ManifestProcessor = z
    .object({
      name: z.string(),
      version: z.string(),
    })
    .meta({ ref: "DocumentManifestProcessor" });
  export type ManifestProcessor = z.infer<typeof ManifestProcessor>;

  export const ManifestSource = z
    .object({
      original: z.string(),
    })
    .meta({ ref: "DocumentManifestSource" });
  export type ManifestSource = z.infer<typeof ManifestSource>;

  export const ManifestContentLayout = z
    .object({
      basePath: z.string(),
      assetsPath: z.string(),
    })
    .meta({ ref: "DocumentManifestContentLayout" });
  export type ManifestContentLayout = z.infer<typeof ManifestContentLayout>;

  export const ManifestAiLayout = z
    .object({
      summariesPath: z.string(),
    })
    .meta({ ref: "DocumentManifestAiLayout" });
  export type ManifestAiLayout = z.infer<typeof ManifestAiLayout>;

  // Discriminated union by `kind`. Today there's only one arm (EPUB);
  // adding `article`/`pdf` is one more arm + a new pipeline. Reader code
  // reads base fields without branching and only branches on `kind` when
  // it cares about format-specific metadata.
  //
  // schemaVersion 2 adds: documentId, userId, processor identity,
  // createdAt/updatedAt, contentHash (sha256 of original bytes; invalidates
  // derived indexes + summaries), source.original (R2 key), content
  // basePath/assetsPath, ai.summariesPath. See PRD §8.
  const ManifestBase = z.object({
    schemaVersion: z.literal(2),
    documentId: z.string(),
    userId: z.string(),
    processor: ManifestProcessor,
    createdAt: z.string(),
    updatedAt: z.string(),
    contentHash: z.string(),
    title: z.string(),
    language: z.string(),
    coverImage: z.string().nullable(),
    chapterCount: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    source: ManifestSource,
    content: ManifestContentLayout,
    ai: ManifestAiLayout,
    sections: z.array(SectionSummary),
  });

  export const EpubManifest = ManifestBase.extend({
    kind: z.literal("epub"),
    metadata: Epub.ManifestMetadata,
    toc: z.array(Epub.TocItem),
  }).meta({ ref: "EpubManifest" });
  export type EpubManifest = z.infer<typeof EpubManifest>;

  export const Manifest = z
    .discriminatedUnion("kind", [EpubManifest])
    .meta({ ref: "DocumentManifest" });
  export type Manifest = z.infer<typeof Manifest>;

  // ---- Row → Entity mapping ---------------------------------------------
  // BinderDO returns the catalog row with progress joined; this projects it
  // onto the user-facing Document.Entity. Exported so peer features (e.g.
  // Shelf, which surfaces the same document rows from its own joins) can
  // share a single canonical projection instead of duplicating it.
  export const fromBinderRow = (row: DocumentWithProgressRow): Entity => ({
    id: row.documentId,
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
    progress: row.progress
      ? {
          sectionKey: row.progress.sectionKey,
          progressPercent: row.progress.progressPercent,
          updatedAt: new Date(row.progress.updatedAt).toISOString(),
        }
      : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });

  const parseKind = (raw: string): Kind => {
    if (raw === "epub") return raw;
    throw new Error(`Unexpected document.kind value: ${raw}`);
  };

  const parseStatus = (raw: string): Status => {
    if (raw === "uploading" || raw === "processing" || raw === "processed" || raw === "failed") {
      return raw;
    }
    return "failed";
  };

  // ---- Operations -------------------------------------------------------
  export type CreateInput = {
    userId: string;
    bytes: Uint8Array;
    filename: string;
    declaredMimeType: string | null;
    sensitive: boolean;
  };

  // Persist the upload, kick off async processing, and return the row in
  // its `processing` state. The actual parse + render runs inside the
  // per-kind Cloudflare Workflow that `Processor.trigger` enqueues; tests
  // swap the binding's `create` for an inline runner via the test runtime.
  export const create = async (input: CreateInput): Promise<Entity> => {
    if (input.bytes.byteLength === 0) {
      throw new UploadEmptyError({ message: "Empty upload body" });
    }
    const detection = detectFormat(input.bytes, input.declaredMimeType, input.filename);
    if (!detection) {
      throw new UnsupportedFormatError({
        mimeType: input.declaredMimeType ?? undefined,
        filename: input.filename,
      });
    }

    const id = crypto.randomUUID();
    const sha256 = await sha256Hex(input.bytes);
    const ext = extensionFor(detection.kind, input.filename);
    const r2KeyOriginal = `users/${input.userId}/documents/${id}/original${ext}`;

    await DocumentAssetStore.putOriginal(input.userId, id, ext, input.bytes, detection.mimeType);

    const binder = Binder.require(input.userId);
    let entity: Entity;
    try {
      const row = await binder.createDocument({
        documentId: id,
        kind: detection.kind,
        mimeType: detection.mimeType,
        originalFilename: input.filename,
        sizeBytes: input.bytes.byteLength,
        contentHash: sha256,
        title: titleFromFilename(input.filename),
        sensitive: input.sensitive,
        status: "processing",
        originalKey: r2KeyOriginal,
      });
      entity = fromBinderRow({ ...row, progress: null });
    } catch (e) {
      // Rollback the R2 write so a half-created document doesn't sit in the
      // bucket — the user retries cleanly.
      await DocumentAssetStore.removeAll(input.userId, id).catch(() => {});
      throw e;
    }

    try {
      await Processor.trigger(detection.kind, { userId: input.userId, documentId: id });
    } catch (e) {
      // Workflow trigger failed (e.g. binding misconfigured). Leave the row
      // and blob so a manual reprocess is possible, but surface the failure
      // as the document's recorded error.
      await binder.markDocumentFailed({
        documentId: id,
        reason: `Failed to start processing: ${(e as Error).message}`,
      });
    }

    return entity;
  };

  export const list = async (userId: string): Promise<Entity[]> => {
    const rows = await Binder.require(userId).listDocumentsWithProgress();
    return rows.map(fromBinderRow);
  };

  export const get = async (userId: string, id: string): Promise<Entity> => {
    const row = await Binder.require(userId).getDocumentWithProgress(id);
    if (!row) throw new NotFoundError({ id });
    return fromBinderRow(row);
  };

  export const getStatus = async (userId: string, id: string): Promise<StatusPayload> => {
    const entity = await get(userId, id);
    return { id: entity.id, status: entity.status, errorReason: entity.errorReason };
  };

  export const remove = async (userId: string, id: string): Promise<void> => {
    const existing = await Binder.require(userId).getDocument(id);
    if (!existing) throw new NotFoundError({ id });
    // Async workflow: BinderDO row + DocumentDO storage + R2 sweep run as
    // separate idempotent steps so a failure replays just that step. The
    // BinderDO catalog row vanishes inside the first step (typically <1s),
    // so list/get reads stop returning the doc almost immediately. The
    // route returns 202 to reflect the async semantics.
    await DocumentDeletion.trigger({ userId, documentId: id });
  };

  export const update = async (userId: string, id: string, input: UpdateInput): Promise<Entity> => {
    const updated = await Binder.require(userId).updateDocument({
      documentId: id,
      title: input.title,
    });
    if (!updated) throw new NotFoundError({ id });
    // Refetch via the joined read so the response carries the up-to-date
    // progress alongside the renamed title — the writer doesn't bother
    // joining itself.
    return get(userId, id);
  };

  export const getOriginal = async (
    userId: string,
    id: string,
  ): Promise<DocumentAssetStore.Asset | null> => {
    const row = await Binder.require(userId).getDocument(id);
    if (!row) return null;
    return DocumentAssetStore.getOriginal(userId, id, row.originalKey);
  };

  export const getAsset = async (
    userId: string,
    id: string,
    name: string,
  ): Promise<DocumentAssetStore.Asset | null> => {
    const row = await Binder.require(userId).getDocument(id);
    if (!row) return null;
    return DocumentAssetStore.getAsset(userId, id, name);
  };

  // ---- Manifest accessors -----------------------------------------------
  export const getManifest = async (userId: string, id: string): Promise<Manifest> => {
    await getProcessed(userId, id);
    const manifest = await DocumentAssetStore.getManifest(userId, id, Manifest);
    if (!manifest) {
      throw new ManifestMissingError({ id, message: "Manifest not found in R2" });
    }
    return manifest;
  };

  export const getSectionHtml = async (
    userId: string,
    id: string,
    order: number,
  ): Promise<DocumentAssetStore.Asset> => {
    const manifest = await getManifest(userId, id);
    const section = manifest.sections.find((s) => s.order === order);
    if (!section) throw new SectionNotFoundError({ id, order });
    const asset = await DocumentAssetStore.getContent(userId, id, basename(section.files.html));
    if (!asset) throw new SectionNotFoundError({ id, order });
    return asset;
  };

  export const getSectionText = async (
    userId: string,
    id: string,
    order: number,
  ): Promise<DocumentAssetStore.Asset> => {
    const manifest = await getManifest(userId, id);
    const section = manifest.sections.find((s) => s.order === order);
    if (!section) throw new SectionNotFoundError({ id, order });
    const asset = await DocumentAssetStore.getContent(userId, id, basename(section.files.text));
    if (!asset) throw new SectionNotFoundError({ id, order });
    return asset;
  };

  // ---- Workflow callbacks -----------------------------------------------
  // Used by the format processors and deletion workflow. They live here
  // (rather than in storage.ts) so the feature module owns its full
  // lifecycle surface and workflow steps depend on a single feature import.

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
    await Binder.require(userId).markDocumentProcessed({
      documentId: id,
      title: input.title,
      coverImage: input.coverImage,
      manifestKey: input.manifestKey,
    });
  };

  export const markFailed = async (userId: string, id: string, reason: string): Promise<void> => {
    await Binder.require(userId).markDocumentFailed({ documentId: id, reason });
  };

  // Used by the deletion workflow. Drops the BinderDO catalog row and
  // cascades child tables (highlights, notes, progress, shelf membership,
  // FTS chunk refs); conversations.primary_document_id is set NULL.
  // Returns true if the row existed before removal — the workflow's R2
  // sweep step doesn't need the signal but the inline test runner uses it
  // for assertion shape parity with the previous storage helper.
  export const removeFromBinder = async (userId: string, id: string): Promise<boolean> => {
    const binder = Binder.require(userId);
    const existing = await binder.getDocument(id);
    if (!existing) return false;
    await binder.removeDocument(id);
    return true;
  };

  // ---- Helpers (feature-local) ------------------------------------------
  const getProcessed = async (userId: string, id: string): Promise<Entity> => {
    const entity = await get(userId, id);
    if (entity.status !== "processed") {
      throw new NotProcessedError({ id, status: entity.status });
    }
    return entity;
  };

  // Manifest stores `files.html` as a relative path under `content/`
  // (e.g. "content/0001-introduction.html"). The asset-store's
  // `getContent` already prefixes `content/` itself, so we strip the
  // leading folder here. Defensive against a manifest writer that omits it.
  const basename = (path: string): string => {
    const stripped = path.startsWith("content/") ? path.slice("content/".length) : path;
    return stripped;
  };

  const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const buffer = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
    const view = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < view.length; i++) {
      out += view[i].toString(16).padStart(2, "0");
    }
    return out;
  };

  const titleFromFilename = (filename: string): string => {
    const dot = filename.lastIndexOf(".");
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    return stem.trim() || filename || "Untitled";
  };

  const extensionFor = (_kind: Kind, filename: string): string => {
    const dot = filename.lastIndexOf(".");
    if (dot > 0) {
      const ext = filename.slice(dot).toLowerCase();
      if (/^\.[a-z0-9]{1,8}$/.test(ext)) return ext;
    }
    return ".epub";
  };
}
