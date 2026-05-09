import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BinderStore } from "../binder-store";

// Bun:sqlite-backed SqlStorage shim. Production exposes
// `ctx.storage.sql.exec(sql, ...args)` returning an iterable cursor with a
// `.toArray()` method; we mirror that surface against an in-memory sqlite.
//
// Multi-statement migration blocks (semicolons, no params) route through
// `db.exec` so the entire schema applies at once. Single parameterised
// statements route through `db.prepare` + run/all.
const createFakeSql = (): { sql: SqlStorage; close: () => void } => {
  const db = new Database(":memory:");
  const sql = {
    exec: (stmt: string, ...args: unknown[]) => {
      if (args.length === 0 && /;\s*\S/m.test(stmt.trim())) {
        db.exec(stmt);
        return makeCursor([]);
      }
      const trimmed = stmt.trim().toLowerCase();
      const isQuery =
        trimmed.startsWith("select") ||
        trimmed.startsWith("with") ||
        trimmed.startsWith("pragma") ||
        / returning /i.test(stmt);
      const prepared = db.prepare(stmt);
      if (isQuery) {
        const rows = prepared.all(...(args as never[]));
        return makeCursor(rows);
      }
      prepared.run(...(args as never[]));
      return makeCursor([]);
    },
  } as unknown as SqlStorage;
  return { sql, close: () => db.close() };
};

const makeCursor = <T>(rows: T[]) => {
  const cursor = {
    [Symbol.iterator]: function* () {
      for (const row of rows) yield row;
    },
    toArray: () => rows,
  };
  return cursor as unknown as ReturnType<SqlStorage["exec"]>;
};

const newDocument = () => ({
  documentId: `doc_${crypto.randomUUID()}`,
  kind: "epub",
  mimeType: "application/epub+zip",
  originalFilename: "book.epub",
  sizeBytes: 1024,
  contentHash: "abc123",
  title: "Book",
  sensitive: false,
  status: "processing",
  originalKey: "users/u1/documents/d1/original.epub",
});

const seedDocument = (store: BinderStore, documentId = "d1") =>
  store.createDocument({
    ...newDocument(),
    documentId,
    title: documentId,
    originalKey: `users/u1/documents/${documentId}/original.epub`,
  });

describe("BinderStore catalog", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
  });

  afterEach(() => close());

  test("createDocument persists and getDocument returns the row", () => {
    const input = newDocument();
    const created = store.createDocument(input);
    expect(created.documentId).toBe(input.documentId);
    expect(created.title).toBe("Book");
    expect(created.status).toBe("processing");

    const fetched = store.getDocument(input.documentId);
    expect(fetched).not.toBeNull();
    expect(fetched?.contentHash).toBe("abc123");
  });

  test("listDocuments returns rows newest-first", async () => {
    const a = newDocument();
    const b = newDocument();
    store.createDocument(a);
    await new Promise((r) => setTimeout(r, 2));
    store.createDocument(b);
    const all = store.listDocuments();
    expect(all).toHaveLength(2);
    expect(all[0].documentId).toBe(b.documentId);
    expect(all[1].documentId).toBe(a.documentId);
  });

  test("updateDocument changes title and bumps updated_at", async () => {
    const input = newDocument();
    const created = store.createDocument(input);
    await new Promise((r) => setTimeout(r, 2));
    const updated = store.updateDocument({
      documentId: input.documentId,
      title: "Renamed",
    });
    expect(updated?.title).toBe("Renamed");
    expect(updated!.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  test("updateDocument on missing row returns null", () => {
    const result = store.updateDocument({ documentId: "nope", title: "x" });
    expect(result).toBeNull();
  });

  test("markDocumentProcessed flips status, applies title + cover, clears errorReason", () => {
    const input = newDocument();
    store.createDocument(input);
    store.markDocumentFailed({ documentId: input.documentId, reason: "boom" });
    store.markDocumentProcessed({
      documentId: input.documentId,
      title: "Final Title",
      coverImage: "assets/cover.jpg",
      manifestKey: "users/u1/documents/d1/manifest.json",
    });
    const row = store.getDocument(input.documentId);
    expect(row?.status).toBe("processed");
    expect(row?.errorReason).toBeNull();
    expect(row?.title).toBe("Final Title");
    expect(row?.coverImage).toBe("assets/cover.jpg");
    expect(row?.manifestKey).toBe("users/u1/documents/d1/manifest.json");
  });

  test("markDocumentProcessed with null title preserves existing title", () => {
    const input = newDocument();
    store.createDocument(input);
    store.markDocumentProcessed({
      documentId: input.documentId,
      title: null,
      coverImage: null,
      manifestKey: "users/u1/documents/d1/manifest.json",
    });
    const row = store.getDocument(input.documentId);
    expect(row?.title).toBe("Book");
    expect(row?.status).toBe("processed");
    expect(row?.manifestKey).toBe("users/u1/documents/d1/manifest.json");
  });

  test("markDocumentFailed records the reason", () => {
    const input = newDocument();
    store.createDocument(input);
    store.markDocumentFailed({ documentId: input.documentId, reason: "parse error" });
    const row = store.getDocument(input.documentId);
    expect(row?.status).toBe("failed");
    expect(row?.errorReason).toBe("parse error");
  });

  test("removeDocument is idempotent and clears the row", () => {
    const input = newDocument();
    store.createDocument(input);
    store.removeDocument(input.documentId);
    expect(store.getDocument(input.documentId)).toBeNull();
    // Second call against an already-deleted doc is a no-op (workflow replay
    // safety per PRD §9 prose).
    store.removeDocument(input.documentId);
    expect(store.getDocument(input.documentId)).toBeNull();
  });

  test("indexDocumentChunks inserts refs and is idempotent on UPSERT", () => {
    const input = newDocument();
    store.createDocument(input);
    const chunks = [
      {
        sectionKey: "epub:section:1",
        sectionTitle: "Chapter 1",
        sectionOrder: 1,
        chunkIndex: 0,
        startOffset: 0,
        endOffset: 5,
        textPath: "content/1-chapter-1.txt",
        text: "hello",
      },
      {
        sectionKey: "epub:section:1",
        sectionTitle: "Chapter 1",
        sectionOrder: 1,
        chunkIndex: 1,
        startOffset: 5,
        endOffset: 10,
        textPath: "content/1-chapter-1.txt",
        text: "world",
      },
    ];
    store.indexDocumentChunks({
      documentId: input.documentId,
      documentTitle: input.title,
      chunks,
    });
    // Replay with same shape — no duplicates.
    store.indexDocumentChunks({
      documentId: input.documentId,
      documentTitle: input.title,
      chunks,
    });
    expect(store.search({ query: "hello" }).map((hit) => hit.documentId)).toEqual([
      input.documentId,
    ]);
    store.removeDocument(input.documentId);
    expect(store.getDocument(input.documentId)).toBeNull();
    expect(store.search({ query: "hello" })).toEqual([]);
  });

  test("indexDocumentChunks throws when documents row missing", () => {
    expect(() =>
      store.indexDocumentChunks({
        documentId: "not-there",
        documentTitle: "Ghost",
        chunks: [],
      }),
    ).toThrow();
  });
});

describe("BinderStore progress", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
    seedDocument(store, "d1");
    seedDocument(store, "d2");
  });

  afterEach(() => close());

  test("upsertProgress inserts then updates the same row", () => {
    const a = store.upsertProgress({
      documentId: "d1",
      sectionKey: "epub:section:0",
      position: { offset: 100 },
      progressPercent: 0.1,
    });
    expect(a.progressPercent).toBe(0.1);
    expect(a.position).toEqual({ offset: 100 });

    const b = store.upsertProgress({
      documentId: "d1",
      sectionKey: "epub:section:5",
      position: null,
      progressPercent: 0.5,
    });
    expect(b.sectionKey).toBe("epub:section:5");
    expect(b.position).toBeNull();
    expect(b.progressPercent).toBe(0.5);
    // createdAt preserved across upsert.
    expect(b.createdAt).toBe(a.createdAt);
  });

  test("listProgressByDocuments returns map keyed by documentId", () => {
    store.upsertProgress({
      documentId: "d1",
      sectionKey: "k",
      position: null,
      progressPercent: 0.2,
    });
    store.upsertProgress({
      documentId: "d2",
      sectionKey: "k",
      position: null,
      progressPercent: 0.9,
    });
    const map = store.listProgressByDocuments(["d1", "d2", "d3"]);
    expect(map.size).toBe(2);
    expect(map.get("d1")?.progressPercent).toBe(0.2);
    expect(map.get("d3")).toBeUndefined();
  });
});

describe("BinderStore highlights", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
    seedDocument(store, "d1");
    seedDocument(store, "d2");
  });

  afterEach(() => close());

  const makeHighlight = (n: number) => ({
    highlightId: `h${n}`,
    documentId: "d1",
    sectionKey: `epub:section:${n}`,
    position: { offsetStart: 0, offsetEnd: 5 },
    textSnippet: `snip ${n}`,
    color: "yellow",
  });

  test("createHighlight + getHighlight roundtrip", () => {
    const created = store.createHighlight(makeHighlight(0));
    expect(created.highlightId).toBe("h0");
    expect(store.getHighlight("h0")).toEqual(created);
    expect(store.getHighlight("nope")).toBeNull();
  });

  test("listHighlights orders by createdAt ASC and respects sectionKey filter", async () => {
    store.createHighlight(makeHighlight(0));
    await new Promise((r) => setTimeout(r, 2));
    store.createHighlight(makeHighlight(1));
    const all = store.listHighlights({ documentId: "d1" });
    expect(all.map((h) => h.highlightId)).toEqual(["h0", "h1"]);
    const onlySection0 = store.listHighlights({
      documentId: "d1",
      sectionKey: "epub:section:0",
    });
    expect(onlySection0).toHaveLength(1);
  });

  test("listHighlightsAll orders DESC and applies limit", async () => {
    store.createHighlight(makeHighlight(0));
    await new Promise((r) => setTimeout(r, 2));
    store.createHighlight(makeHighlight(1));
    const all = store.listHighlightsAll({ limit: 10 });
    expect(all.map((h) => h.highlightId)).toEqual(["h1", "h0"]);
    const top1 = store.listHighlightsAll({ limit: 1 });
    expect(top1).toHaveLength(1);
    expect(top1[0].highlightId).toBe("h1");
  });

  test("updateHighlight color, removeHighlight idempotence", () => {
    store.createHighlight(makeHighlight(0));
    const updated = store.updateHighlight({ highlightId: "h0", color: "green" });
    expect(updated?.color).toBe("green");
    expect(store.removeHighlight("h0")).toBe(true);
    expect(store.removeHighlight("h0")).toBe(false);
  });
});

describe("BinderStore notes", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
    seedDocument(store, "d1");
  });

  afterEach(() => close());

  test("createNote + listNotes filters", async () => {
    store.createNote({
      noteId: "n1",
      documentId: "d1",
      sectionKey: "k1",
      highlightId: null,
      body: "anchored",
    });
    await new Promise((r) => setTimeout(r, 2));
    store.createNote({
      noteId: "n2",
      documentId: "d1",
      sectionKey: null,
      highlightId: null,
      body: "loose",
    });

    const sectionScoped = store.listNotes({ documentId: "d1", sectionKey: "k1" });
    expect(sectionScoped.map((n) => n.noteId)).toEqual(["n1"]);

    const unanchored = store.listNotes({ documentId: "d1", unanchored: true });
    expect(unanchored.map((n) => n.noteId)).toEqual(["n2"]);

    const all = store.listNotesAll({ limit: 10 });
    expect(all.map((n) => n.noteId)).toEqual(["n2", "n1"]);
  });

  test("highlight foreign key is nullable but enforced when present", () => {
    store.createHighlight({
      highlightId: "h1",
      documentId: "d1",
      sectionKey: "k1",
      position: { offsetStart: 0, offsetEnd: 5 },
      textSnippet: "snip",
      color: "yellow",
    });

    const documentNote = store.createNote({
      noteId: "n-doc",
      documentId: "d1",
      sectionKey: null,
      highlightId: null,
      body: "document note",
    });
    expect(documentNote.highlightId).toBeNull();

    const highlightNote = store.createNote({
      noteId: "n-highlight",
      documentId: "d1",
      sectionKey: "k1",
      highlightId: "h1",
      body: "highlight note",
    });
    expect(highlightNote.highlightId).toBe("h1");

    expect(() =>
      store.createNote({
        noteId: "n-missing-highlight",
        documentId: "d1",
        sectionKey: null,
        highlightId: "missing-highlight",
        body: "missing highlight",
      }),
    ).toThrow();

    expect(() =>
      store.createNote({
        noteId: "n-cross-doc-highlight",
        documentId: "d2",
        sectionKey: null,
        highlightId: "h1",
        body: "cross-doc highlight",
      }),
    ).toThrow();
  });

  test("updateNote body + removeNote idempotence", () => {
    store.createNote({
      noteId: "n1",
      documentId: "d1",
      sectionKey: null,
      highlightId: null,
      body: "v1",
    });
    const updated = store.updateNote({ noteId: "n1", body: "v2" });
    expect(updated?.body).toBe("v2");
    expect(store.removeNote("n1")).toBe(true);
    expect(store.removeNote("n1")).toBe(false);
  });
});

describe("BinderStore shelves + smart shelves", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
  });

  afterEach(() => close());

  test("createShelf + listShelves with itemCount = 0", () => {
    store.createShelf({ shelfId: "sh1", name: "Reading", description: null });
    const all = store.listShelves();
    expect(all).toHaveLength(1);
    expect(all[0].itemCount).toBe(0);
  });

  test("addShelfDocument is idempotent and itemCount tracks membership", () => {
    store.createShelf({ shelfId: "sh1", name: "Reading", description: null });
    // Need a documents row for the JOIN in listShelfDocuments to find it.
    store.createDocument({
      documentId: "d1",
      kind: "epub",
      mimeType: "application/epub+zip",
      originalFilename: "x.epub",
      sizeBytes: 1,
      contentHash: "h",
      title: "Doc1",
      sensitive: false,
      status: "processed",
      originalKey: "users/u/documents/d1/original.epub",
    });
    store.addShelfDocument({ shelfId: "sh1", documentId: "d1" });
    store.addShelfDocument({ shelfId: "sh1", documentId: "d1" });
    expect(store.getShelf("sh1")?.itemCount).toBe(1);

    const docs = store.listShelfDocuments("sh1");
    expect(docs.map((d) => d.documentId)).toEqual(["d1"]);
  });

  test("removeShelf cascades shelf_documents", () => {
    store.createShelf({ shelfId: "sh1", name: "X", description: null });
    store.createDocument({
      documentId: "d1",
      kind: "epub",
      mimeType: "x",
      originalFilename: "x",
      sizeBytes: 0,
      contentHash: "h",
      title: "T",
      sensitive: false,
      status: "processed",
      originalKey: "k",
    });
    store.addShelfDocument({ shelfId: "sh1", documentId: "d1" });
    expect(store.removeShelf("sh1")).toBe(true);
    expect(store.removeShelf("sh1")).toBe(false);
    expect(store.listShelfDocuments("sh1")).toEqual([]);
  });

  test("findShelfByLowerName is case-insensitive", () => {
    store.createShelf({ shelfId: "sh1", name: "Design", description: null });
    expect(store.findShelfByLowerName("design")?.shelfId).toBe("sh1");
    expect(store.findShelfByLowerName("nope")).toBeNull();
  });

  test("smartCounts + smartDocuments split reading vs finished", () => {
    for (const id of ["d1", "d2", "d3"]) {
      store.createDocument({
        documentId: id,
        kind: "epub",
        mimeType: "x",
        originalFilename: "x",
        sizeBytes: 0,
        contentHash: "h",
        title: id,
        sensitive: false,
        status: "processed",
        originalKey: `k-${id}`,
      });
    }
    store.upsertProgress({
      documentId: "d1",
      sectionKey: "k",
      position: null,
      progressPercent: 0.3,
    });
    store.upsertProgress({
      documentId: "d2",
      sectionKey: "k",
      position: null,
      progressPercent: 1,
    });
    store.upsertProgress({
      documentId: "d3",
      sectionKey: "k",
      position: null,
      progressPercent: null,
    });
    const counts = store.smartCounts();
    expect(counts.reading).toBe(2);
    expect(counts.finished).toBe(1);
    const reading = store.smartDocuments("reading");
    expect(reading.map((d) => d.documentId).sort()).toEqual(["d1", "d3"]);
    const finished = store.smartDocuments("finished");
    expect(finished.map((d) => d.documentId)).toEqual(["d2"]);
    expect(finished[0].progress?.progressPercent).toBe(1);
  });

  test("shelvesForDocument returns shelves containing the doc", () => {
    store.createShelf({ shelfId: "sh1", name: "A", description: null });
    store.createShelf({ shelfId: "sh2", name: "B", description: null });
    store.createDocument({
      documentId: "d1",
      kind: "epub",
      mimeType: "x",
      originalFilename: "x",
      sizeBytes: 0,
      contentHash: "h",
      title: "T",
      sensitive: false,
      status: "processed",
      originalKey: "k",
    });
    store.addShelfDocument({ shelfId: "sh1", documentId: "d1" });
    const shelves = store.shelvesForDocument("d1");
    expect(shelves.map((s) => s.shelfId)).toEqual(["sh1"]);
  });
});

describe("BinderStore conversations", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
  });

  afterEach(() => close());

  test("createConversation + getConversation roundtrips", () => {
    const created = store.createConversation({
      conversationId: "c1",
      title: "Lease talks",
      primaryDocumentId: null,
    });
    expect(created.title).toBe("Lease talks");
    expect(created.primaryDocumentId).toBeNull();
    expect(store.getConversation("c1")?.title).toBe("Lease talks");
    expect(store.getConversation("missing")).toBeNull();
  });

  test("listConversations orders by last_activity_at DESC", async () => {
    store.createConversation({ conversationId: "a", title: "A", primaryDocumentId: null });
    // Bump activity timestamps with a small wait so the integer ms differ.
    await new Promise((r) => setTimeout(r, 5));
    store.createConversation({ conversationId: "b", title: "B", primaryDocumentId: null });
    expect(store.listConversations().map((c) => c.conversationId)).toEqual(["b", "a"]);

    await new Promise((r) => setTimeout(r, 5));
    store.touchConversation("a");
    expect(store.listConversations().map((c) => c.conversationId)).toEqual(["a", "b"]);
  });

  test("updateConversation patches title", () => {
    store.createConversation({ conversationId: "c1", title: "Old", primaryDocumentId: null });
    const updated = store.updateConversation({ conversationId: "c1", title: "New" });
    expect(updated?.title).toBe("New");
    expect(store.updateConversation({ conversationId: "missing", title: "x" })).toBeNull();
  });

  test("touchConversation returns null for missing rows", () => {
    expect(store.touchConversation("missing")).toBeNull();
  });

  test("removeConversation returns true on delete, false otherwise", () => {
    store.createConversation({ conversationId: "c1", title: "x", primaryDocumentId: null });
    expect(store.removeConversation("c1")).toBe(true);
    expect(store.removeConversation("c1")).toBe(false);
    expect(store.getConversation("c1")).toBeNull();
  });

  test("removeDocument nulls primary_document_id on conversations", () => {
    store.createDocument({
      documentId: "d1",
      kind: "epub",
      mimeType: "application/epub+zip",
      originalFilename: "x",
      sizeBytes: 0,
      contentHash: "h",
      title: "T",
      sensitive: false,
      status: "processed",
      originalKey: "k",
    });
    store.createConversation({
      conversationId: "c1",
      title: "Scoped",
      primaryDocumentId: "d1",
    });
    store.removeDocument("d1");
    expect(store.getConversation("c1")?.primaryDocumentId).toBeNull();
  });
});

describe("BinderStore search", () => {
  let close: () => void;
  let store: BinderStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new BinderStore(fake.sql);
  });

  afterEach(() => close());

  // Two-document corpus shared by every search assertion.
  const seedCorpus = () => {
    store.createDocument({
      documentId: "doc-a",
      kind: "epub",
      mimeType: "application/epub+zip",
      originalFilename: "a.epub",
      sizeBytes: 1,
      contentHash: "ha",
      title: "Foxes of the World",
      sensitive: false,
      status: "processed",
      originalKey: "users/u/documents/doc-a/original.epub",
    });
    store.createDocument({
      documentId: "doc-b",
      kind: "receipt",
      mimeType: "image/png",
      originalFilename: "b.png",
      sizeBytes: 1,
      contentHash: "hb",
      title: "Apple Store Receipt",
      sensitive: false,
      status: "processed",
      originalKey: "users/u/documents/doc-b/original.png",
    });
    store.indexDocumentChunks({
      documentId: "doc-a",
      documentTitle: "Foxes of the World",
      chunks: [
        {
          sectionKey: "epub:section:0",
          sectionTitle: "Chapter 1",
          sectionOrder: 0,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 25,
          textPath: "content/0-chapter-1.txt",
          text: "the quick brown fox jumps",
        },
        {
          sectionKey: "epub:section:1",
          sectionTitle: "Chapter 2",
          sectionOrder: 1,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 14,
          textPath: "content/1-chapter-2.txt",
          text: "another paragraph",
        },
      ],
    });
    store.indexDocumentChunks({
      documentId: "doc-b",
      documentTitle: "Apple Store Receipt",
      chunks: [
        {
          sectionKey: "receipt:body",
          sectionTitle: null,
          sectionOrder: 0,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 33,
          textPath: "content/body.txt",
          text: "Apple iPhone 15 receipt total $999",
        },
      ],
    });
  };

  test("search returns ranked refs across documents", () => {
    seedCorpus();
    const hits = store.search({ query: "Apple" });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.documentId).toBe("doc-b");
    expect(hits[0]!.documentTitle).toBe("Apple Store Receipt");
    expect(hits[0]!.kind).toBe("receipt");
    expect(hits[0]!.terms).toEqual(["apple"]);
  });

  test("search returns [] for empty queries", () => {
    seedCorpus();
    expect(store.search({ query: "" })).toEqual([]);
    expect(store.search({ query: "  ?!  " })).toEqual([]);
  });

  test("search applies kind filter", () => {
    seedCorpus();
    const onlyEpub = store.search({ query: "fox", kind: "epub" });
    expect(onlyEpub.length).toBeGreaterThan(0);
    for (const h of onlyEpub) expect(h.kind).toBe("epub");
    const onlyReceipt = store.search({ query: "fox", kind: "receipt" });
    expect(onlyReceipt).toEqual([]);
  });

  test("search applies excludeDocumentId filter", () => {
    seedCorpus();
    // Wider query to ensure both docs would otherwise match.
    const wide = store.search({ query: "the apple fox" });
    expect(wide.length).toBeGreaterThan(1);
    const filtered = store.search({
      query: "the apple fox",
      excludeDocumentId: "doc-b",
    });
    for (const h of filtered) expect(h.documentId).not.toBe("doc-b");
  });

  test("search applies excludeSectionKey filter", () => {
    seedCorpus();
    // Re-add a second epub:section:0 chunk on doc-a so the exclude filter
    // has visible work to do.
    store.indexDocumentChunks({
      documentId: "doc-a",
      documentTitle: "Foxes of the World",
      chunks: [
        {
          sectionKey: "epub:section:1",
          sectionTitle: "Chapter 2",
          sectionOrder: 1,
          chunkIndex: 1,
          startOffset: 14,
          endOffset: 30,
          textPath: "content/1-chapter-2.txt",
          text: "more about the fox",
        },
      ],
    });
    const all = store.search({ query: "fox" });
    expect(all.map((h) => h.sectionKey)).toContain("epub:section:0");
    const filtered = store.search({
      query: "fox",
      excludeSectionKey: "epub:section:0",
    });
    for (const h of filtered) expect(h.sectionKey).not.toBe("epub:section:0");
  });

  test("search respects limit", () => {
    seedCorpus();
    const hits = store.search({ query: "the fox apple", limit: 1 });
    expect(hits).toHaveLength(1);
  });

  test("renaming a document refreshes the displayed title on subsequent hits", () => {
    // document_title is intentionally not indexed in binder_chunks_fts —
    // search hits surface the renamed title via the JOIN to binder_chunk_refs
    // instead. Title-token search is out of scope at the chunk level.
    store.createDocument({
      documentId: "doc-title",
      kind: "epub",
      mimeType: "application/epub+zip",
      originalFilename: "title.epub",
      sizeBytes: 1,
      contentHash: "ht",
      title: "Old Binder Name",
      sensitive: false,
      status: "processed",
      originalKey: "users/u/documents/doc-title/original.epub",
    });
    store.indexDocumentChunks({
      documentId: "doc-title",
      documentTitle: "Old Binder Name",
      chunks: [
        {
          sectionKey: "epub:section:0",
          sectionTitle: "Chapter 1",
          sectionOrder: 0,
          chunkIndex: 0,
          startOffset: 0,
          endOffset: 5,
          textPath: "content/0-chapter-1.txt",
          text: "alpha",
        },
      ],
    });

    const before = store.search({ query: "alpha" });
    expect(before).toHaveLength(1);
    expect(before[0]!.documentTitle).toBe("Old Binder Name");

    store.updateDocument({ documentId: "doc-title", title: "Fresh Binder Name" });

    const after = store.search({ query: "alpha" });
    expect(after).toHaveLength(1);
    expect(after[0]!.documentTitle).toBe("Fresh Binder Name");

    // Title tokens are not in the FTS index, so neither the old nor the new
    // title produces token-level matches.
    expect(store.search({ query: "old" })).toEqual([]);
    expect(store.search({ query: "fresh" })).toEqual([]);
  });
});
