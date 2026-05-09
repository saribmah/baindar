import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DocumentStore, type ChunkInput, type SectionInput } from "../document-store";
import { compileFtsOrQuery, compileFtsQuery, tokenizeQuery } from "../processing/fts-query";

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

const section = (order: number, key = `epub:section:${order}`): SectionInput => ({
  sectionKey: key,
  sectionOrder: order,
  title: `Chapter ${order}`,
  wordCount: 100,
  textPath: `content/${order}-chapter-${order}.txt`,
});

const chunk = (sectionKey: string, idx: number, text: string): ChunkInput => ({
  sectionKey,
  sectionOrder: 1,
  sectionTitle: "Chapter 1",
  chunkIndex: idx,
  startOffset: idx * 100,
  endOffset: idx * 100 + text.length,
  textPath: "content/1-chapter-1.txt",
  text,
});

describe("DocumentStore", () => {
  let close: () => void;
  let store: DocumentStore;

  beforeEach(() => {
    const fake = createFakeSql();
    close = fake.close;
    store = new DocumentStore(fake.sql);
  });

  afterEach(() => close());

  test("init upserts meta and getMeta returns it", () => {
    store.init({
      documentId: "doc1",
      userId: "user1",
      kind: "epub",
      manifestKey: "users/user1/documents/doc1/manifest.json",
      contentHash: "sha256:abc",
    });
    const meta = store.getMeta();
    expect(meta.documentId).toBe("doc1");
    expect(meta.userId).toBe("user1");
    expect(meta.kind).toBe("epub");
    expect(meta.contentHash).toBe("sha256:abc");
  });

  test("init is idempotent (overwrites the same keys)", () => {
    store.init({
      documentId: "doc1",
      userId: "user1",
      kind: "epub",
      manifestKey: "k1",
      contentHash: "h1",
    });
    store.init({
      documentId: "doc1",
      userId: "user1",
      kind: "epub",
      manifestKey: "k2",
      contentHash: "h2",
    });
    const meta = store.getMeta();
    expect(meta.manifestKey).toBe("k2");
    expect(meta.contentHash).toBe("h2");
  });

  test("indexChunks inserts sections and chunks", () => {
    const s = section(1);
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "hello world"), chunk(s.sectionKey, 1, "second chunk text")],
    });
    const read = store.readSection({ sectionKey: s.sectionKey });
    expect(read.chunks).toHaveLength(2);
    expect(read.chunks[0].text).toBe("hello world");
    expect(read.chunks[1].chunkIndex).toBe(1);
  });

  test("indexChunks is idempotent on (sectionKey, chunkIndex)", () => {
    const s = section(1);
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "v1")],
    });
    // Second call with the same chunkIndex but new text overwrites in place.
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "v2")],
    });
    const snippet = store.getChunkSnippet({ sectionKey: s.sectionKey, chunkIndex: 0 });
    expect(snippet?.text).toBe("v2");
    // Only one row total — replay didn't duplicate.
    const all = store.readSection({ sectionKey: s.sectionKey });
    expect(all.chunks).toHaveLength(1);
  });

  test("getChunkSnippet returns null for missing chunks", () => {
    expect(store.getChunkSnippet({ sectionKey: "nope", chunkIndex: 0 })).toBeNull();
  });

  test("search ranks bm25 hits and renders FTS snippets", () => {
    const s1 = section(1);
    const s2 = section(2);
    store.indexChunks({
      sections: [s1, s2],
      chunks: [
        chunk(s1.sectionKey, 0, "the quick brown fox jumps over the lazy dog"),
        chunk(s1.sectionKey, 1, "another paragraph about cats and dogs"),
        chunk(s2.sectionKey, 0, "a fox is a small carnivorous mammal"),
        chunk(s2.sectionKey, 1, "no relevant content here"),
      ],
    });

    const hits = store.search({ query: "fox" });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // Both chunks containing "fox" come back; ordering follows bm25.
    const keys = hits.map((h) => `${h.sectionKey}#${h.chunkIndex}`);
    expect(keys).toContain(`${s1.sectionKey}#0`);
    expect(keys).toContain(`${s2.sectionKey}#0`);
    // Snippets carry the FTS5 highlight markers.
    expect(hits[0]!.snippet.toLowerCase()).toContain("<mark>fox</mark>");
  });

  test("search returns [] for empty/whitespace queries", () => {
    const s = section(1);
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "some text")],
    });
    expect(store.search({ query: "" })).toEqual([]);
    expect(store.search({ query: "   " })).toEqual([]);
    expect(store.search({ query: "!!!" })).toEqual([]);
  });

  test("search respects limit", () => {
    const s = section(1);
    const chunks: ChunkInput[] = [];
    for (let i = 0; i < 5; i++) chunks.push(chunk(s.sectionKey, i, `match ${i}`));
    store.indexChunks({ sections: [s], chunks });
    const hits = store.search({ query: "match", limit: 2 });
    expect(hits).toHaveLength(2);
  });

  test("getChunkSnippet renders FTS snippet when terms supplied", () => {
    const s = section(1);
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "alpha beta gamma delta epsilon")],
    });
    const snippet = store.getChunkSnippet({
      sectionKey: s.sectionKey,
      chunkIndex: 0,
      terms: ["gamma"],
    });
    expect(snippet?.text.toLowerCase()).toContain("<mark>gamma</mark>");
  });

  test("getChunkSnippet falls back to plain text when terms don't match", () => {
    const s = section(1);
    store.indexChunks({
      sections: [s],
      chunks: [chunk(s.sectionKey, 0, "alpha beta gamma")],
    });
    const snippet = store.getChunkSnippet({
      sectionKey: s.sectionKey,
      chunkIndex: 0,
      terms: ["nonexistent"],
    });
    expect(snippet?.text).toBe("alpha beta gamma");
  });

  test("readSection paginates with offset/limit", () => {
    const s = section(1);
    const chunks: ChunkInput[] = [];
    for (let i = 0; i < 10; i++) chunks.push(chunk(s.sectionKey, i, `chunk-${i}`));
    store.indexChunks({ sections: [s], chunks });
    const page1 = store.readSection({ sectionKey: s.sectionKey, offset: 0, limit: 4 });
    const page2 = store.readSection({ sectionKey: s.sectionKey, offset: 4, limit: 4 });
    expect(page1.chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3]);
    expect(page2.chunks.map((c) => c.chunkIndex)).toEqual([4, 5, 6, 7]);
  });
});

describe("FTS query compilation", () => {
  test("tokenizeQuery splits on non-alphanumeric and lowercases", () => {
    expect(tokenizeQuery("Hello, World!")).toEqual(["hello", "world"]);
    expect(tokenizeQuery("don't stop")).toEqual(["don", "t", "stop"]);
    expect(tokenizeQuery("café résumé")).toEqual(["café", "résumé"]);
  });

  test("tokenizeQuery dedupes preserving first-seen order", () => {
    expect(tokenizeQuery("fox FOX fox bar")).toEqual(["fox", "bar"]);
  });

  test("tokenizeQuery handles empty and punctuation-only inputs", () => {
    expect(tokenizeQuery("")).toEqual([]);
    expect(tokenizeQuery("   ")).toEqual([]);
    expect(tokenizeQuery("!!! ??? ###")).toEqual([]);
  });

  test("compileFtsQuery returns null for tokenless input", () => {
    expect(compileFtsQuery("")).toBeNull();
    expect(compileFtsQuery("?!*")).toBeNull();
  });

  test("compileFtsQuery emits prefix-matched tokens for single-word queries", () => {
    expect(compileFtsQuery("fox")).toBe('"fox"*');
  });

  test("compileFtsQuery combines phrase + OR-of-prefix-tokens for multi-word queries", () => {
    const q = compileFtsQuery("brown fox");
    expect(q).toBe('"brown fox" OR "brown"* OR "fox"*');
  });

  test("compileFtsOrQuery flattens terms into OR list, dedupes, and skips empties", () => {
    expect(compileFtsOrQuery(["fox"])).toBe('"fox"');
    expect(compileFtsOrQuery(["fox", "FOX", "dog"])).toBe('"fox" OR "dog"');
    expect(compileFtsOrQuery(["", "  ", "!!"])).toBeNull();
  });
});
