import { Binder } from "../../../binder/binder";
import { formatErrorChain } from "../../../utils/error";
import { padOrder, slugify } from "../../../utils/slug";
import { DocumentAssetStore } from "../../asset-store";
import { DocumentBinding } from "../../document-binding";
import type { Document } from "../../document";
import { chunkSection } from "../../processing/chunk";
import { DocumentStorage } from "../../storage";
import { Epub } from "./epub";
import { ParseFailure } from "./parser";

// `error_reason` is exposed to users on the failed-document row, so cap the
// chained message before it balloons (drizzle's query-error message alone
// can run multiple kilobytes of bound parameters).
const MAX_REASON_LENGTH = 2000;

// Processor identity baked into manifest v2 so consumers can tell which
// pipeline rendered a document and at what version. Bump `version` on
// behavior changes that should invalidate consumers' caches.
const PROCESSOR = { name: "baindar-epub", version: "0.1.0" } as const;

// ---------------------------------------------------------------------------
// EPUB workflow step bodies. Each function is idempotent and is reused by
// both the Cloudflare Workflow class (`./workflow.ts`) and the inline runner
// used in tests. Step functions assume an `Instance.provide(...)` frame is
// already in scope — the workflow class wraps each step.do callback in
// `provide(...)`; tests run inside the harness's own Instance frame.
//
// This file deliberately has no `cloudflare:workers` dependency so the
// Bun-based unit test runtime can import and execute the steps directly.
// ---------------------------------------------------------------------------

export type LoadResult = { originalKey: string; contentHash: string };

export const loadDocument = async (userId: string, documentId: string): Promise<LoadResult> => {
  const row = await Binder.require(userId).getDocument(documentId);
  if (!row) throw new Error(`Document ${documentId} not found`);
  if (row.kind !== "epub") {
    throw new Error(`EpubWorkflow expected kind=epub for ${documentId}, got ${row.kind}`);
  }
  return { originalKey: row.originalKey, contentHash: row.contentHash };
};

export const resetRendered = async (userId: string, documentId: string): Promise<void> => {
  await DocumentAssetStore.removeRendered(userId, documentId);
};

export const parseAndRender = async (
  userId: string,
  documentId: string,
  originalKey: string,
  contentHash: string,
): Promise<Document.EpubManifest> => {
  const bytes = await DocumentAssetStore.getOriginalBytes(userId, documentId, originalKey);
  if (!bytes) throw new Error(`Original blob missing at ${originalKey}`);

  let parsed: Epub.Parsed;
  try {
    parsed = Epub.parse(bytes);
  } catch (e) {
    if (e instanceof ParseFailure) {
      throw new Epub.InvalidFormatError({ reason: e.message });
    }
    throw e;
  }
  if (parsed.chapters.length === 0) {
    throw new Epub.EmptyError({ message: "EPUB contained no readable chapters" });
  }

  for (const img of parsed.images) {
    await DocumentAssetStore.putAsset(userId, documentId, img.name, img.bytes, img.contentType);
  }

  const usedNames = new Set<string>();
  const sections: Document.SectionSummary[] = [];
  for (const chapter of parsed.chapters) {
    const baseName = `${padOrder(chapter.order)}-${slugify(chapter.title, `section-${chapter.order + 1}`)}`;
    const fileName = uniqueName(baseName, usedNames);
    const htmlName = `${fileName}.html`;
    const textName = `${fileName}.txt`;

    await DocumentAssetStore.putContent(
      userId,
      documentId,
      htmlName,
      chapter.html,
      "text/html; charset=utf-8",
    );
    await DocumentAssetStore.putContent(
      userId,
      documentId,
      textName,
      chapter.text,
      "text/plain; charset=utf-8",
    );

    sections.push({
      sectionKey: Epub.sectionKey(chapter.order),
      order: chapter.order,
      title: chapter.title,
      wordCount: chapter.wordCount,
      linear: chapter.linear,
      href: chapter.href,
      files: { html: `content/${htmlName}`, text: `content/${textName}` },
    });
  }

  const wordCount = parsed.chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const now = new Date().toISOString();
  const docPrefix = `users/${userId}/documents/${documentId}/`;
  const sourceOriginal = originalKey.startsWith(docPrefix)
    ? originalKey.slice(docPrefix.length)
    : originalKey;
  return {
    schemaVersion: 2,
    kind: "epub",
    documentId,
    userId,
    processor: { name: PROCESSOR.name, version: PROCESSOR.version },
    createdAt: now,
    updatedAt: now,
    contentHash,
    title: parsed.metadata.title || "Untitled",
    language: parsed.metadata.language,
    coverImage: parsed.metadata.coverImage,
    chapterCount: parsed.chapters.length,
    wordCount,
    source: { original: sourceOriginal },
    content: { basePath: "content", assetsPath: "assets" },
    ai: { summariesPath: "ai/summaries" },
    sections,
    metadata: {
      authors: parsed.metadata.authors,
      description: parsed.metadata.description,
      publisher: parsed.metadata.publisher,
      publishedDate: parsed.metadata.publishedDate,
      identifiers: parsed.metadata.identifiers,
      subjects: parsed.metadata.subjects,
    },
    toc: flattenToc(parsed.toc),
  };
};

export type FinalizedManifest = {
  title: string | null;
  coverImage: string | null;
  manifestKey: string;
};

export const writeManifest = async (
  userId: string,
  documentId: string,
  manifest: Document.EpubManifest,
): Promise<FinalizedManifest> => {
  await DocumentAssetStore.putManifest(userId, documentId, manifest);
  return {
    title: manifest.title || null,
    coverImage: manifest.coverImage,
    manifestKey: `users/${userId}/documents/${documentId}/manifest.json`,
  };
};

export const markProcessed = async (
  userId: string,
  documentId: string,
  finalized: FinalizedManifest,
): Promise<void> => {
  await DocumentStorage.markProcessed(userId, documentId, finalized);
};

export const recordFailure = async (
  userId: string,
  documentId: string,
  error: unknown,
): Promise<void> => {
  const reason = (formatErrorChain(error) || "Processing failed").slice(0, MAX_REASON_LENGTH);
  await DocumentStorage.markFailed(userId, documentId, reason);
};

// ---------------------------------------------------------------------------
// Inline runner. Same end-state semantics as the Workflow class: success
// path runs every step; failure path is caught and recorded on the document
// row (no exception propagates). Tests stub the EPUB_PROCESSOR binding's
// `create` with this so post-trigger document state matches production for
// both happy and parse-failure paths.
// ---------------------------------------------------------------------------

export const runEpubInline = async (userId: string, documentId: string): Promise<void> => {
  try {
    const loaded = await loadDocument(userId, documentId);
    await resetRendered(userId, documentId);
    const manifest = await parseAndRender(
      userId,
      documentId,
      loaded.originalKey,
      loaded.contentHash,
    );
    const finalized = await writeManifest(userId, documentId, manifest);
    await indexDocument(userId, documentId, loaded.contentHash, manifest, finalized);
    await markProcessed(userId, documentId, finalized);
  } catch (error) {
    await recordFailure(userId, documentId, error);
  }
};

// Idempotently initialize the per-document actor after the manifest write.
// This runs as its own Workflow checkpoint so retries don't replay parsing.
export const initDocumentDO = async (
  userId: string,
  documentId: string,
  contentHash: string,
  finalized: FinalizedManifest,
): Promise<void> => {
  await DocumentBinding.require(documentId).init({
    documentId,
    userId,
    kind: "epub",
    manifestKey: finalized.manifestKey,
    contentHash,
  });
};

// Index one deterministic section batch. Workflow retries re-enter a single
// section and both backing stores UPSERT by stable keys, so repeated
// execution updates rows instead of duplicating chunks.
export const indexDocumentBatch = async (
  userId: string,
  documentId: string,
  documentTitle: string,
  section: Document.SectionSummary,
): Promise<void> => {
  const textPath = section.files.text;
  const asset = await DocumentAssetStore.getContent(userId, documentId, basename(textPath));
  if (!asset) {
    throw new Error(`Section text missing at ${textPath}`);
  }

  const sectionInput = {
    sectionKey: section.sectionKey,
    sectionOrder: section.order,
    title: section.title || null,
    wordCount: section.wordCount,
    textPath,
  };
  const text = await streamToString(asset.body);
  const chunks = chunkSection(text);
  const documentDOChunks = chunks.map((c) => ({
    sectionKey: section.sectionKey,
    sectionOrder: section.order,
    sectionTitle: section.title || null,
    chunkIndex: c.chunkIndex,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
    textPath,
    text: c.text,
  }));

  await DocumentBinding.require(documentId).indexChunks({
    sections: [sectionInput],
    chunks: documentDOChunks,
  });

  if (documentDOChunks.length === 0) return;
  await Binder.require(userId).indexDocumentChunks({
    documentId,
    documentTitle,
    chunks: documentDOChunks.map((c) => ({
      sectionKey: c.sectionKey,
      sectionTitle: c.sectionTitle,
      sectionOrder: c.sectionOrder,
      chunkIndex: c.chunkIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      textPath: c.textPath,
      text: c.text,
    })),
  });
};

// Inline/test helper with the same successful end-state as the Workflow
// class: initialize DocumentDO once, then run every section batch.
export const indexDocument = async (
  userId: string,
  documentId: string,
  contentHash: string,
  manifest: Document.EpubManifest,
  finalized: FinalizedManifest,
): Promise<void> => {
  await initDocumentDO(userId, documentId, contentHash, finalized);
  for (const section of manifest.sections) {
    await indexDocumentBatch(userId, documentId, manifest.title, section);
  }
};

const basename = (path: string): string => {
  const stripped = path.startsWith("content/") ? path.slice("content/".length) : path;
  return stripped;
};

const streamToString = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
};

// ---------------------------------------------------------------------------
// File-local helpers
// ---------------------------------------------------------------------------

// Filename collisions don't matter for correctness — manifest.json carries
// the canonical pointer — but we still want unique R2 keys so a later
// chapter doesn't overwrite an earlier one's bytes.
const uniqueName = (baseName: string, used: Set<string>): string => {
  if (!used.has(baseName)) {
    used.add(baseName);
    return baseName;
  }
  let i = 2;
  while (used.has(`${baseName}-${i}`)) i++;
  const candidate = `${baseName}-${i}`;
  used.add(candidate);
  return candidate;
};

// Flatten the EPUB TOC tree into the depth+parent representation used by the
// manifest. Recursive zod schemas don't survive the OpenAPI codegen pipeline
// cleanly, so we expose a flat list and let clients rebuild the tree from
// `parent` if needed.
const flattenToc = (rows: Epub.ParsedTocNode[]): Epub.TocItem[] => {
  const out: Epub.TocItem[] = [];
  const visit = (entries: Epub.ParsedTocNode[], depth: number, parent: number | null): void => {
    for (const entry of entries) {
      const index = out.length;
      out.push({
        index,
        parent,
        depth,
        title: entry.title,
        href: entry.href,
        fileHref: entry.fileHref,
        anchor: entry.anchor,
      });
      if (entry.children.length > 0) visit(entry.children, depth + 1, index);
    }
  };
  visit(rows, 0, null);
  return out;
};
