import type { ZodType } from "zod";
import { Config } from "../config/config";

// R2-backed asset store for documents. Keys live under
// `users/{userId}/documents/{documentId}/` so a per-user purge is one prefix
// sweep and original blobs are never co-mingled across owners.
//
// Layout:
//   original.{ext}          - raw upload, written at create time
//   manifest.json           - canonical document index (toc, sections, metadata)
//   content/{name}          - per-section render payload (.html) and canonical
//                             text (.txt). Names are slug-prefixed by order.
//   assets/{name}           - extracted images / fonts referenced by content
export namespace DocumentAssetStore {
  const docPrefix = (userId: string, documentId: string): string =>
    `users/${userId}/documents/${documentId}/`;

  const originalKey = (userId: string, documentId: string, ext: string): string =>
    `${docPrefix(userId, documentId)}original${ext}`;

  const assetKey = (userId: string, documentId: string, name: string): string =>
    `${docPrefix(userId, documentId)}assets/${name}`;

  const contentKey = (userId: string, documentId: string, name: string): string =>
    `${docPrefix(userId, documentId)}content/${name}`;

  const manifestKey = (userId: string, documentId: string): string =>
    `${docPrefix(userId, documentId)}manifest.json`;

  // Summary artifacts live alongside content/assets so `removeAll`'s prefix
  // sweep deletes them with the rest of a document's R2 footprint. The
  // filename is owned by the caller (Ai.summarize) — section vs document
  // disambiguation needs the targetKey, not just the contentHash, so the
  // store doesn't try to compute the filename itself.
  const aiSummaryKey = (userId: string, documentId: string, name: string): string =>
    `${docPrefix(userId, documentId)}ai/summaries/${name}`;

  export type Asset = {
    body: ReadableStream<Uint8Array>;
    contentType: string;
    size: number;
  };

  export const putOriginal = async (
    userId: string,
    documentId: string,
    ext: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> => {
    await Config.requireR2Bucket().put(originalKey(userId, documentId, ext), bytes, {
      httpMetadata: { contentType },
    });
  };

  export const putAsset = async (
    userId: string,
    documentId: string,
    name: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> => {
    await Config.requireR2Bucket().put(assetKey(userId, documentId, name), bytes, {
      httpMetadata: { contentType },
    });
  };

  export const putContent = async (
    userId: string,
    documentId: string,
    name: string,
    body: string | Uint8Array,
    contentType: string,
  ): Promise<void> => {
    await Config.requireR2Bucket().put(contentKey(userId, documentId, name), body, {
      httpMetadata: { contentType },
    });
  };

  // Manifest is written last in the pipeline — its presence is the
  // source-of-truth that processing succeeded. A partial-failure run leaves
  // chapter content in place but no manifest, so a reprocess does
  // `removeAll` then writes everything fresh.
  export const putManifest = async (
    userId: string,
    documentId: string,
    manifest: unknown,
  ): Promise<void> => {
    const json = JSON.stringify(manifest);
    await Config.requireR2Bucket().put(manifestKey(userId, documentId), json, {
      httpMetadata: { contentType: "application/json" },
    });
  };

  export const getOriginal = async (
    userId: string,
    documentId: string,
    key: string,
  ): Promise<Asset | null> => {
    // The full key is stored on the document row (since the extension is
    // chosen at upload time). Verify it sits under this user's prefix so a
    // malformed row can't be coerced into reading another user's data.
    if (!key.startsWith(docPrefix(userId, documentId))) return null;
    const obj = await Config.requireR2Bucket().get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
    };
  };

  export const getAsset = async (
    userId: string,
    documentId: string,
    name: string,
  ): Promise<Asset | null> => {
    const obj = await Config.requireR2Bucket().get(assetKey(userId, documentId, name));
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
    };
  };

  export const getContent = async (
    userId: string,
    documentId: string,
    name: string,
  ): Promise<Asset | null> => {
    const obj = await Config.requireR2Bucket().get(contentKey(userId, documentId, name));
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
    };
  };

  // Reads + validates manifest.json against the supplied zod schema. Returns
  // null when the manifest is missing (still-processing or partial-failure
  // states). A schema mismatch throws — that's a corrupted manifest and
  // callers should let the error bubble so the workflow can re-process.
  export const getManifest = async <T>(
    userId: string,
    documentId: string,
    schema: ZodType<T>,
  ): Promise<T | null> => {
    const obj = await Config.requireR2Bucket().get(manifestKey(userId, documentId));
    if (!obj) return null;
    const text = await obj.text();
    const parsed: unknown = JSON.parse(text);
    return schema.parse(parsed);
  };

  // AI summary artifacts. One R2 object per (targetType, targetKey,
  // contentHash); see PRD §15. Caller computes the deterministic filename
  // (e.g. `document-{contentHash}.json` or
  // `section-{contentHash}-{slug(sectionKey)}.json`) and provides it here.
  export const putAiSummary = async (
    userId: string,
    documentId: string,
    name: string,
    body: string,
  ): Promise<string> => {
    const key = aiSummaryKey(userId, documentId, name);
    await Config.requireR2Bucket().put(key, body, {
      httpMetadata: { contentType: "application/json" },
    });
    return key;
  };

  export const getAiSummary = async (
    userId: string,
    documentId: string,
    name: string,
  ): Promise<Asset | null> => {
    const obj = await Config.requireR2Bucket().get(aiSummaryKey(userId, documentId, name));
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? "application/json",
      size: obj.size,
    };
  };

  export const getOriginalBytes = async (
    userId: string,
    documentId: string,
    key: string,
  ): Promise<Uint8Array | null> => {
    if (!key.startsWith(docPrefix(userId, documentId))) return null;
    const obj = await Config.requireR2Bucket().get(key);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    return new Uint8Array(buffer);
  };

  // Idempotent prefix sweep across `original.*`, `manifest.json`,
  // `content/*`, and `assets/*` for a single document. R2 list returns at
  // most 1000 keys per page; we paginate defensively for asset-heavy docs.
  export const removeAll = async (userId: string, documentId: string): Promise<void> => {
    await sweep(docPrefix(userId, documentId));
  };

  // Drop everything the pipeline produces (manifest, content, assets) but
  // preserve `original.{ext}` so a reprocess doesn't need to re-upload.
  // Used at the top of the pipeline so partial-failure state from a prior
  // run doesn't leave orphan files alongside the fresh output.
  export const removeRendered = async (userId: string, documentId: string): Promise<void> => {
    const prefix = docPrefix(userId, documentId);
    await Promise.all([
      sweep(`${prefix}manifest.json`),
      sweep(`${prefix}content/`),
      sweep(`${prefix}assets/`),
    ]);
  };

  const sweep = async (prefix: string): Promise<void> => {
    const bucket = Config.requireR2Bucket();
    let cursor: string | undefined;
    while (true) {
      const page = await bucket.list({ prefix, cursor });
      const keys = page.objects.map((o) => o.key);
      if (keys.length > 0) await bucket.delete(keys);
      if (!page.truncated) break;
      cursor = page.cursor;
    }
  };
}
