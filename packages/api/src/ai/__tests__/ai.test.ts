import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Ai } from "../ai";
import { Binder } from "../../binder/binder";
import { DocumentBinding } from "../../document/document-binding";
import { createTestRuntime, seedBinderDocument } from "../../document/__tests__/test-db";

// Seed a binder + document with two chunks across two sections. Skips the
// EPUB workflow; we directly call BinderDO.indexDocumentChunks +
// DocumentDO.indexChunks so the test fakes carry searchable content. Real
// FTS5 indexing is exercised by the BinderStore/DocumentStore unit tests;
// here we only need the route surface to pass through.
const seedSearchable = async (
  userId: string,
  options: {
    documentId?: string;
    title?: string;
    kind?: "epub";
  } = {},
): Promise<{ documentId: string; title: string }> => {
  const id = options.documentId ?? crypto.randomUUID();
  const title = options.title ?? "Foxes of the World";
  const kind = options.kind ?? "epub";
  await seedBinderDocument(userId, { id, kind, title });
  const documentId = id;
  const documentDO = DocumentBinding.require(documentId);
  await documentDO.init({
    documentId,
    userId,
    kind,
    manifestKey: `users/${userId}/documents/${documentId}/manifest.json`,
    contentHash: "0".repeat(64),
  });

  const sections = [
    {
      sectionKey: "epub:section:0",
      sectionOrder: 0,
      title: "Chapter 1",
      wordCount: 7,
      textPath: "content/0-chapter-1.txt",
    },
    {
      sectionKey: "epub:section:1",
      sectionOrder: 1,
      title: "Chapter 2",
      wordCount: 7,
      textPath: "content/1-chapter-2.txt",
    },
  ];
  const chunks = [
    {
      sectionKey: "epub:section:0",
      sectionOrder: 0,
      sectionTitle: "Chapter 1",
      chunkIndex: 0,
      startOffset: 0,
      endOffset: 26,
      textPath: "content/0-chapter-1.txt",
      text: "the quick brown fox jumps",
    },
    {
      sectionKey: "epub:section:1",
      sectionOrder: 1,
      sectionTitle: "Chapter 2",
      chunkIndex: 0,
      startOffset: 0,
      endOffset: 18,
      textPath: "content/1-chapter-2.txt",
      text: "another paragraph",
    },
  ];

  await documentDO.indexChunks({ sections, chunks });
  await Binder.require(userId).indexDocumentChunks({
    documentId,
    documentTitle: title,
    chunks: chunks.map((c) => ({
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
  return { documentId, title };
};

describe("Ai feature", () => {
  const userA = "user-a";
  const userB = "user-b";
  let runtime: ReturnType<typeof createTestRuntime>;

  beforeEach(() => {
    runtime = createTestRuntime([
      { id: userA, name: "Alice", email: "alice@example.com" },
      { id: userB, name: "Bob", email: "bob@example.com" },
    ]);
  });

  afterEach(() => {
    runtime.close();
  });

  it("cross-binder search returns enriched hits with snippets", async () => {
    await runtime.runAs(userA, async () => {
      const { documentId, title } = await seedSearchable(userA);
      const items = await Ai.search(userA, { query: "fox" });
      expect(items.length).toBeGreaterThan(0);
      const hit = items.find((h) => h.documentId === documentId);
      expect(hit).toBeDefined();
      expect(hit?.documentTitle).toBe(title);
      expect(hit?.snippet.toLowerCase()).toContain("<mark>fox</mark>");
    });
  });

  it("in-document search routes to DocumentDO when documentId is set", async () => {
    await runtime.runAs(userA, async () => {
      const a = await seedSearchable(userA, { title: "Doc A" });
      const b = await seedSearchable(userA, { title: "Doc B" });

      const items = await Ai.search(userA, {
        query: "fox",
        documentId: a.documentId,
      });
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item.documentId).toBe(a.documentId);
      // Cross-binder against `b` should also hit, distinct from in-doc result.
      void b;
    });
  });

  it("kind filter scopes cross-binder search", async () => {
    await runtime.runAs(userA, async () => {
      const epubDoc = await seedSearchable(userA);
      // Seed a second doc but pretend it's a different kind by mutating the
      // FakeBinder row directly — easier than wiring a non-epub kind through
      // detect/Document.create.
      const otherId = crypto.randomUUID();
      await seedBinderDocument(userA, {
        id: otherId,
        title: "Other",
        originalFilename: "other.epub",
      });

      const onlyEpub = await Ai.search(userA, { query: "fox", kind: "epub" });
      expect(onlyEpub.find((h) => h.documentId === epubDoc.documentId)).toBeDefined();
      const onlyReceipt = await Ai.search(userA, { query: "fox", kind: "receipt" });
      expect(onlyReceipt).toEqual([]);
    });
  });

  it("excludeDocumentId removes the targeted document", async () => {
    await runtime.runAs(userA, async () => {
      const a = await seedSearchable(userA, { title: "Doc A" });
      const b = await seedSearchable(userA, { title: "Doc B" });

      const all = await Ai.search(userA, { query: "fox" });
      const allDocIds = new Set(all.map((h) => h.documentId));
      expect(allDocIds.has(a.documentId)).toBe(true);
      expect(allDocIds.has(b.documentId)).toBe(true);

      const filtered = await Ai.search(userA, {
        query: "fox",
        excludeDocumentId: a.documentId,
      });
      for (const h of filtered) expect(h.documentId).not.toBe(a.documentId);
    });
  });

  it("Ai.search rejects cross-user document scope as not found", async () => {
    const a = await runtime.runAs(userA, () => seedSearchable(userA));
    await runtime.runAs(userB, async () => {
      await expect(
        Ai.search(userB, { query: "fox", documentId: a.documentId }),
      ).rejects.toMatchObject({ name: "DocumentNotFoundError" });
    });
  });

  it("Ai.read paginates a section's chunks", async () => {
    await runtime.runAs(userA, async () => {
      const { documentId } = await seedSearchable(userA);
      const result = await Ai.read(userA, {
        documentId,
        sectionKey: "epub:section:0",
        offset: 0,
        limit: 10,
      });
      expect(result.documentId).toBe(documentId);
      expect(result.sectionKey).toBe("epub:section:0");
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0]?.text).toContain("fox");
    });
  });

  it("Ai.read rejects cross-user reads as not found", async () => {
    const a = await runtime.runAs(userA, () => seedSearchable(userA));
    await runtime.runAs(userB, async () => {
      await expect(
        Ai.read(userB, { documentId: a.documentId, sectionKey: "epub:section:0" }),
      ).rejects.toMatchObject({ name: "DocumentNotFoundError" });
    });
  });

  it("Ai.summarize throws NotImplementedError (stub for Phase 6)", async () => {
    await runtime.runAs(userA, async () => {
      await expect(
        Ai.summarize(userA, {
          documentId: "anything",
          targetType: "section",
          targetKey: "epub:section:0",
        }),
      ).rejects.toMatchObject({ name: "AiNotImplementedError" });
    });
  });
});
