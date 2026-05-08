import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Document } from "../../document/document";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";
import { Progress } from "../../progress/progress";
import { Shelf } from "../../shelf/shelf";
import { createErrorMapper } from "../error-mapper";

const documentRouter = new Hono<AppEnv>();

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

documentRouter.post(
  "/",
  describeRoute({
    summary: "Upload a document",
    description:
      "Multipart upload. Required field `file` (binary). Optional `sensitive` (boolean string). Returns the created document with status='processing'; processing runs asynchronously via Workflow. Only EPUB is currently supported.",
    operationId: "document.create",
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: {
              file: { type: "string", format: "binary" },
              sensitive: { type: "string", enum: ["true", "false"] },
            },
          },
        },
      },
    },
    responses: {
      201: {
        description: "Document created (processing started)",
        content: { "application/json": { schema: resolver(Document.Entity) } },
      },
      400: { description: "Invalid request" },
      401: { description: "Not authenticated" },
      413: { description: "Upload exceeds size limit" },
      415: { description: "Unsupported file format" },
    },
  }),
  requireAuth,
  async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ message: "Expected multipart/form-data body" }, 400);
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return c.json({ message: "Missing or empty `file`" }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ message: "Upload exceeds size limit" }, 413);
    }

    const sensitiveRaw = formData.get("sensitive");
    const sensitive = typeof sensitiveRaw === "string" && sensitiveRaw.toLowerCase() === "true";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const filename = file.name || "upload.bin";
    const declaredMimeType = file.type || null;

    const mapError = createErrorMapper([
      { error: Document.UploadEmptyError, status: 400 },
      { error: Document.UploadTooLargeError, status: 413 },
      { error: Document.UnsupportedFormatError, status: 415 },
    ]);

    try {
      const entity = await Document.create({
        userId: Instance.userId,
        bytes,
        filename,
        declaredMimeType,
        sensitive,
      });
      return c.json(entity, 201);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/",
  describeRoute({
    summary: "List documents",
    operationId: "document.list",
    responses: {
      200: {
        description: "All documents owned by the caller",
        content: { "application/json": { schema: resolver(Document.ListResponse) } },
      },
      401: { description: "Not authenticated" },
    },
  }),
  requireAuth,
  async (c) => {
    const items = await Document.list(Instance.userId);
    return c.json({ items });
  },
);

documentRouter.get(
  "/:id",
  describeRoute({
    summary: "Get a document",
    operationId: "document.get",
    responses: {
      200: {
        description: "Document metadata",
        content: { "application/json": { schema: resolver(Document.Entity) } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      const entity = await Document.get(Instance.userId, id);
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/:id/status",
  describeRoute({
    summary: "Get processing status",
    description: "Lightweight payload for polling while a document is being processed.",
    operationId: "document.getStatus",
    responses: {
      200: {
        description: "Processing status",
        content: { "application/json": { schema: resolver(Document.StatusPayload) } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      const status = await Document.getStatus(Instance.userId, id);
      return c.json(status);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.patch(
  "/:id",
  describeRoute({
    summary: "Update document metadata",
    description: "Currently supports renaming via `title`. Other fields may follow.",
    operationId: "document.update",
    responses: {
      200: {
        description: "Updated document",
        content: { "application/json": { schema: resolver(Document.Entity) } },
      },
      400: { description: "Invalid input" },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  validator("json", Document.UpdateInput),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      const entity = await Document.update(Instance.userId, id, body);
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.delete(
  "/:id",
  describeRoute({
    summary: "Delete a document",
    description:
      "Triggers asynchronous cleanup via the DELETE_DOCUMENT workflow. The catalog row disappears almost immediately (typically <1s after the call); per-document DO storage + R2 sweep complete in the background.",
    operationId: "document.delete",
    responses: {
      202: { description: "Deletion accepted" },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      await Document.remove(Instance.userId, id);
      return c.body(null, 202);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/:id/raw",
  describeRoute({
    summary: "Stream the original document blob",
    operationId: "document.getRaw",
    responses: {
      200: {
        description: "Original bytes",
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const asset = await Document.getOriginal(Instance.userId, id);
    if (!asset) return c.body(null, 404);
    return c.body(asset.body, 200, {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.size),
      "Cache-Control": "private, max-age=3600",
    });
  },
);

// Derived asset (e.g. extracted images, addressed in section HTML as
// `assets/{name}` relative URLs).
documentRouter.get(
  "/:id/assets/:name",
  describeRoute({
    summary: "Fetch a derived document asset by name",
    operationId: "document.getAsset",
    responses: {
      200: {
        description: "Asset bytes",
        content: { "image/*": { schema: { type: "string", format: "binary" } } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const name = c.req.param("name");
    const asset = await Document.getAsset(Instance.userId, id, name);
    if (!asset) return c.body(null, 404);
    return c.body(asset.body, 200, {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.size),
      "Cache-Control": "private, max-age=3600",
    });
  },
);

documentRouter.post(
  "/:id/progress",
  describeRoute({
    summary: "Upsert reading progress",
    description:
      "Records the caller's reading state. `sectionKey` is the manifest section identifier; optional `position` and `progressPercent` carry within-section offset and overall completion. Overwrites any existing row for this (user, document).",
    operationId: "progress.upsert",
    responses: {
      200: {
        description: "Updated progress",
        content: { "application/json": { schema: resolver(Progress.Entity) } },
      },
      400: { description: "Invalid input" },
      401: { description: "Not authenticated" },
      404: { description: "Document not found" },
    },
  }),
  requireAuth,
  validator("json", Progress.UpsertInput),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      const entity = await Progress.upsert(Instance.userId, id, body);
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/:id/shelves",
  describeRoute({
    summary: "List custom shelves containing this document",
    description:
      "Reverse lookup for the book-detail UI. Smart shelf membership is omitted — derive it from the document's own `progress` field.",
    operationId: "document.listShelves",
    responses: {
      200: {
        description: "Custom shelves containing the document",
        content: { "application/json": { schema: resolver(Shelf.CustomListResponse) } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Document not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper([{ error: Document.NotFoundError, status: 404 }]);
    try {
      const items = await Shelf.listForDocument(Instance.userId, id);
      return c.json({ items });
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

// ---- Manifest + section reading endpoints (type-agnostic) -------------
const manifestErrorMappings = [
  { error: Document.NotFoundError, status: 404 as const },
  { error: Document.NotProcessedError, status: 409 as const },
  { error: Document.ManifestMissingError, status: 409 as const },
  { error: Document.SectionNotFoundError, status: 404 as const },
];

documentRouter.get(
  "/:id/manifest",
  describeRoute({
    summary: "Get the document manifest (type-agnostic index)",
    description:
      "Returns the canonical manifest for the document — discriminated by `kind`, with format-specific metadata in the matching arm and a uniform `sections[]` for navigation.",
    operationId: "document.getManifest",
    responses: {
      200: {
        description: "Document manifest",
        content: { "application/json": { schema: resolver(Document.Manifest) } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Not found" },
      409: { description: "Document not yet processed" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper(manifestErrorMappings);
    try {
      const manifest = await Document.getManifest(Instance.userId, id);
      return c.json(manifest);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/:id/sections/:order/html",
  describeRoute({
    summary: "Stream a section's rendered HTML",
    operationId: "document.getSectionHtml",
    responses: {
      200: {
        description: "Section HTML",
        content: { "text/html": { schema: { type: "string" } } },
      },
      400: { description: "Invalid section order" },
      401: { description: "Not authenticated" },
      404: { description: "Document or section not found" },
      409: { description: "Document not yet processed" },
    },
  }),
  requireAuth,
  async (c) => {
    const order = parseOrder(c.req.param("order"));
    if (order === null) return c.json({ message: "Invalid section order" }, 400);
    const id = c.req.param("id");
    const mapError = createErrorMapper(manifestErrorMappings);
    try {
      const asset = await Document.getSectionHtml(Instance.userId, id, order);
      return c.body(asset.body, 200, {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.size),
        "Cache-Control": "private, max-age=3600",
      });
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

documentRouter.get(
  "/:id/sections/:order/text",
  describeRoute({
    summary: "Stream a section's canonical plain text",
    description:
      "The `.txt` payload that highlight offsets and AI document tools consume. Identical text content to the HTML endpoint with markup stripped.",
    operationId: "document.getSectionText",
    responses: {
      200: {
        description: "Section plain text",
        content: { "text/plain": { schema: { type: "string" } } },
      },
      400: { description: "Invalid section order" },
      401: { description: "Not authenticated" },
      404: { description: "Document or section not found" },
      409: { description: "Document not yet processed" },
    },
  }),
  requireAuth,
  async (c) => {
    const order = parseOrder(c.req.param("order"));
    if (order === null) return c.json({ message: "Invalid section order" }, 400);
    const id = c.req.param("id");
    const mapError = createErrorMapper(manifestErrorMappings);
    try {
      const asset = await Document.getSectionText(Instance.userId, id, order);
      return c.body(asset.body, 200, {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.size),
        "Cache-Control": "private, max-age=3600",
      });
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

const parseOrder = (raw: string): number | null => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
};

export default documentRouter;
