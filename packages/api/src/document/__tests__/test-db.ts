import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AuthContext, RuntimeEnv } from "../../app/context";
import { Binder } from "../../binder/binder";
import type { Db } from "../../db/db";
import { user } from "../../db/schema";
import { Instance } from "../../instance";
import { runEpubInline } from "../formats/epub/steps";
import { runDeletionInline } from "../processing/deletion-steps";

// Seed a binder document row directly via the BinderDO RPC. Tests use this
// instead of `Document.create` because the latter requires a real upload
// + format detection + workflow trigger; tests just want a row in
// arbitrary states (e.g. status="processed" without going through ingest).
export type SeedDocumentOverrides = {
  id?: string;
  kind?: string;
  title?: string;
  status?: string;
  sensitive?: boolean;
  mimeType?: string;
  originalFilename?: string;
};

export const seedBinderDocument = async (
  userId: string,
  overrides: SeedDocumentOverrides = {},
): Promise<{ id: string }> => {
  const id = overrides.id ?? crypto.randomUUID();
  await Binder.require(userId).createDocument({
    documentId: id,
    kind: overrides.kind ?? "epub",
    mimeType: overrides.mimeType ?? "application/epub+zip",
    originalFilename: overrides.originalFilename ?? "seed.epub",
    sizeBytes: 100,
    contentHash: "0".repeat(64),
    title: overrides.title ?? "Seed",
    sensitive: overrides.sensitive ?? false,
    status: overrides.status ?? "processed",
    originalKey: `users/${userId}/documents/${id}/original.epub`,
  });
  return { id };
};

// Convenience seed for `progress` rows. Mirrors what the route handler
// would do, minus auth/feature checks.
export const seedBinderProgress = async (
  userId: string,
  documentId: string,
  progressPercent: number | null,
  sectionKey = "epub:section:0",
): Promise<void> => {
  await Binder.require(userId).upsertProgress({
    documentId,
    sectionKey,
    position: null,
    progressPercent,
  });
};

// Bun:sqlite-backed test harness for storage-touching feature tests.
//
// Type cast: Db is the production D1 Drizzle type. The bun-sqlite Drizzle
// instance has the same SQL builder surface (select/insert/update/delete) but
// a different concrete class, so we cast at the boundary. Storage code only
// uses the shared SQLite query builder API — no D1-specific methods like
// `.batch()` — so the cast is safe.
const migrationsFolder = path.resolve(import.meta.dir, "../../../migrations");

export type TestUser = { id: string; name: string; email: string };

export const createTestRuntime = (
  users: TestUser[],
  envOverrides: Record<string, unknown> = {},
) => {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });

  const now = new Date();
  for (const u of users) {
    db.insert(user)
      .values({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: false,
        image: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // Spy: tests can read this to assert which conversation ids had
  // their DO storage destroyed (Agent.destroy → ChatAgent.destroy()).
  const destroyedConversationIds: string[] = [];

  const env = {
    DB: {} as unknown,
    BUCKET: createFakeR2Bucket(),
    EPUB_PROCESSOR: createFakeEpubProcessor(),
    DELETE_DOCUMENT: createFakeDeleteDocumentBinding(),
    ChatAgent: createFakeChatAgentBinding(destroyedConversationIds),
    BINDER: createFakeBinderBinding(),
    DOCUMENT: createFakeDocumentBinding(),
    ...envOverrides,
  } as RuntimeEnv;

  const runAs = async <R>(userId: string, fn: () => Promise<R>): Promise<R> => {
    const auth: AuthContext = {
      isAuthenticated: true,
      userId,
      user: null,
      authMethod: "session",
    };
    return Instance.provide({ db: db as unknown as Db, env, auth }, fn);
  };

  // Anonymous Instance frame for code paths the Workflow runs (no auth in
  // scope; storage calls that operate by document id are still scoped via
  // the parent table's user_id).
  const runAnonymous = async <R>(fn: () => Promise<R>): Promise<R> => {
    const auth: AuthContext = {
      isAuthenticated: false,
      userId: null,
      user: null,
      authMethod: null,
    };
    return Instance.provide({ db: db as unknown as Db, env, auth }, fn);
  };

  const close = () => sqlite.close();

  return { runAs, runAnonymous, close, destroyedConversationIds };
};

// In-memory R2Bucket fake. Implements only the surface our storage actually
// uses (put/get/list/delete). The cast at return widens to the full R2Bucket
// type — calling any other method in tests would throw.
const createFakeR2Bucket = (): R2Bucket => {
  const store = new Map<string, { bytes: Uint8Array; contentType: string }>();

  const buildObject = (key: string, item: { bytes: Uint8Array; contentType: string }) => ({
    key,
    version: "v1",
    size: item.bytes.byteLength,
    etag: "etag",
    httpEtag: '"etag"',
    uploaded: new Date(),
    httpMetadata: { contentType: item.contentType },
    customMetadata: {},
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(item.bytes);
        controller.close();
      },
    }),
    bodyUsed: false,
    arrayBuffer: async () =>
      item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength),
    text: async () => new TextDecoder().decode(item.bytes),
  });

  const fake = {
    put: async (
      key: string,
      value: ArrayBuffer | Uint8Array | string,
      options?: { httpMetadata?: { contentType?: string } },
    ) => {
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof Uint8Array
            ? value
            : new Uint8Array(value);
      const contentType = options?.httpMetadata?.contentType ?? "application/octet-stream";
      store.set(key, { bytes, contentType });
      return { key, size: bytes.byteLength };
    },
    get: async (key: string) => {
      const item = store.get(key);
      return item ? buildObject(key, item) : null;
    },
    list: async (opts?: { prefix?: string; cursor?: string }) => {
      const prefix = opts?.prefix ?? "";
      const objects = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({ key: k, size: v.bytes.byteLength }));
      return { objects, truncated: false, delimitedPrefixes: [] };
    },
    delete: async (keys: string | string[]) => {
      const arr = typeof keys === "string" ? [keys] : keys;
      for (const k of arr) store.delete(k);
    },
  };
  return fake as unknown as R2Bucket;
};

// ChatAgent binding fake. Conversation.remove calls Agent.destroy →
// env.ChatAgent.idFromName(...).get(...).destroy(). The fake records the
// id passed to idFromName and a no-op destroy() resolves successfully.
// Fake ChatAgent binding. Conversation.create calls Agent.init({userId,
// conversationId}); Conversation.remove calls Agent.destroy(userId,
// conversationId). Both address the DO via composite name
// `${userId}:${conversationId}`. The fake tracks initialised pairs and
// records destroy calls (by conversationId only — tests already know the
// userId). `init` is idempotent, mirroring the production contract.
const createFakeChatAgentBinding = (destroyedIds: string[]): DurableObjectNamespace => {
  const initialised = new Set<string>();
  const fake = {
    idFromName: (name: string) => ({ __name: name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const name = (id as unknown as { __name: string }).__name;
      const colon = name.indexOf(":");
      const conversationId = colon >= 0 ? name.slice(colon + 1) : name;
      return {
        init: async (input: { userId: string; conversationId: string }) => {
          initialised.add(`${input.userId}:${input.conversationId}`);
        },
        destroy: async () => {
          initialised.delete(name);
          destroyedIds.push(conversationId);
        },
      } as unknown as DurableObjectStub;
    },
  };
  return fake as unknown as DurableObjectNamespace;
};

// BinderDO binding fake. Phase 1 tests exercise the catalog RPC surface
// (createDocument, getDocument, listDocuments, updateDocument,
// markDocumentProcessed/Failed, removeDocument). One in-memory FakeBinder
// per userId — addressed by `idFromName(userId)`. Implementation mirrors
// the production class's semantics without standing up a real DO; it
// matches the BinderDO RPC contract narrowly enough that DocumentStorage's
// dual-write paths exercise both stores identically.
type FakeDocumentRow = {
  documentId: string;
  kind: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  contentHash: string;
  title: string;
  sensitive: boolean;
  status: string;
  errorReason: string | null;
  coverImage: string | null;
  sourceUrl: string | null;
  originalKey: string;
  manifestKey: string | null;
  createdAt: number;
  updatedAt: number;
};

type FakeProgressRow = {
  documentId: string;
  sectionKey: string;
  position: unknown | null;
  progressPercent: number | null;
  createdAt: number;
  updatedAt: number;
};

type FakeHighlightRow = {
  highlightId: string;
  documentId: string;
  sectionKey: string;
  position: unknown;
  textSnippet: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

type FakeNoteRow = {
  noteId: string;
  documentId: string;
  sectionKey: string | null;
  highlightId: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
};

type FakeShelfRow = {
  shelfId: string;
  name: string;
  description: string | null;
  position: number | null;
  createdAt: number;
  updatedAt: number;
};

type FakeShelfMembershipRow = {
  shelfId: string;
  documentId: string;
  position: number | null;
  addedAt: number;
};

type FakeShelfRowWithCount = FakeShelfRow & { itemCount: number };

type FakeDocumentWithProgressRow = FakeDocumentRow & {
  progress: {
    sectionKey: string;
    progressPercent: number | null;
    updatedAt: number;
  } | null;
};

class FakeBinder {
  readonly documents = new Map<string, FakeDocumentRow>();
  readonly progress = new Map<string, FakeProgressRow>();
  readonly highlights = new Map<string, FakeHighlightRow>();
  readonly notes = new Map<string, FakeNoteRow>();
  readonly shelves = new Map<string, FakeShelfRow>();
  readonly shelfMemberships: FakeShelfMembershipRow[] = [];

  async init(): Promise<void> {}

  async createDocument(input: {
    documentId: string;
    kind: string;
    mimeType: string;
    originalFilename: string;
    sizeBytes: number;
    contentHash: string;
    title: string;
    sensitive: boolean;
    status: string;
    originalKey: string;
  }): Promise<FakeDocumentRow> {
    const now = Date.now();
    const row: FakeDocumentRow = {
      documentId: input.documentId,
      kind: input.kind,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
      sizeBytes: input.sizeBytes,
      contentHash: input.contentHash,
      title: input.title,
      sensitive: input.sensitive,
      status: input.status,
      errorReason: null,
      coverImage: null,
      sourceUrl: null,
      originalKey: input.originalKey,
      manifestKey: null,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(input.documentId, row);
    return row;
  }

  async getDocument(documentId: string): Promise<FakeDocumentRow | null> {
    return this.documents.get(documentId) ?? null;
  }

  async getDocumentWithProgress(documentId: string): Promise<FakeDocumentWithProgressRow | null> {
    const row = this.documents.get(documentId);
    return row ? this.withProgress(row) : null;
  }

  async listDocuments(): Promise<FakeDocumentRow[]> {
    return [...this.documents.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async listDocumentsWithProgress(): Promise<FakeDocumentWithProgressRow[]> {
    return [...this.documents.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => this.withProgress(row));
  }

  async updateDocument(input: {
    documentId: string;
    title?: string;
  }): Promise<FakeDocumentRow | null> {
    const row = this.documents.get(input.documentId);
    if (!row) return null;
    if (typeof input.title === "string") {
      row.title = input.title;
      for (const chunk of this.chunks) {
        if (chunk.documentId === input.documentId) chunk.documentTitle = input.title;
      }
    }
    row.updatedAt = Date.now();
    return row;
  }

  async markDocumentProcessed(input: {
    documentId: string;
    title: string | null;
    coverImage: string | null;
    manifestKey?: string | null;
  }): Promise<void> {
    const row = this.documents.get(input.documentId);
    if (!row) return;
    if (input.title) row.title = input.title;
    row.coverImage = input.coverImage;
    if (input.manifestKey !== undefined) row.manifestKey = input.manifestKey;
    row.status = "processed";
    row.errorReason = null;
    row.updatedAt = Date.now();
  }

  async markDocumentFailed(input: { documentId: string; reason: string }): Promise<void> {
    const row = this.documents.get(input.documentId);
    if (!row) return;
    row.status = "failed";
    row.errorReason = input.reason;
    row.updatedAt = Date.now();
  }

  async removeDocument(documentId: string): Promise<void> {
    this.documents.delete(documentId);
    this.chunks = this.chunks.filter((c) => c.documentId !== documentId);
    this.progress.delete(documentId);
    for (const [id, row] of this.highlights) {
      if (row.documentId === documentId) this.highlights.delete(id);
    }
    for (const [id, row] of this.notes) {
      if (row.documentId === documentId) this.notes.delete(id);
    }
    for (let i = this.shelfMemberships.length - 1; i >= 0; i--) {
      if (this.shelfMemberships[i]!.documentId === documentId) {
        this.shelfMemberships.splice(i, 1);
      }
    }
    // Mirror BinderStore.removeDocument: null primary_document_id on any
    // conversation that pointed at this doc rather than cascade-deleting.
    for (const row of this.conversations.values()) {
      if (row.primaryDocumentId === documentId) row.primaryDocumentId = null;
    }
  }

  // Phase 2 — fake captures the chunks a workflow would index. Lookups by
  // document/section help tests assert on indexing behavior without
  // requiring a real BinderDO.
  chunks: Array<{
    documentId: string;
    sectionKey: string;
    sectionTitle: string | null;
    sectionOrder: number;
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
    textPath: string;
    text: string;
    documentTitle: string;
    kind: string;
  }> = [];

  async indexDocumentChunks(input: {
    documentId: string;
    documentTitle: string;
    chunks: Array<{
      sectionKey: string;
      sectionTitle: string | null;
      sectionOrder: number;
      chunkIndex: number;
      startOffset: number;
      endOffset: number;
      textPath: string;
      text: string;
    }>;
  }): Promise<void> {
    const doc = this.documents.get(input.documentId);
    if (!doc) {
      throw new Error(
        `FakeBinder.indexDocumentChunks: documents row missing for ${input.documentId}`,
      );
    }
    for (const c of input.chunks) {
      const existingIndex = this.chunks.findIndex(
        (existing) =>
          existing.documentId === input.documentId &&
          existing.sectionKey === c.sectionKey &&
          existing.chunkIndex === c.chunkIndex,
      );
      const row = {
        documentId: input.documentId,
        documentTitle: input.documentTitle,
        kind: doc.kind,
        sectionKey: c.sectionKey,
        sectionTitle: c.sectionTitle,
        sectionOrder: c.sectionOrder,
        chunkIndex: c.chunkIndex,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        textPath: c.textPath,
        text: c.text,
      };
      if (existingIndex >= 0) this.chunks[existingIndex] = row;
      else this.chunks.push(row);
    }
  }

  // Simple substring-based search: tokenises the query, matches chunks
  // whose text/section_title/document_title contains any token (case-
  // insensitive). Score is `-matches` so smaller is "better" (mirroring
  // production bm25 ordering). Good enough for route/contract tests; the
  // BinderStore tests exercise real FTS5.
  async search(input: {
    query: string;
    limit?: number;
    kind?: string;
    excludeDocumentId?: string;
    excludeSectionKey?: string;
  }): Promise<
    Array<{
      documentId: string;
      documentTitle: string;
      kind: string;
      sectionKey: string;
      sectionTitle: string | null;
      chunkIndex: number;
      score: number;
      terms: string[];
    }>
  > {
    const tokens = input.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length === 0) return [];

    const limit = input.limit ?? 10;
    const ranked = this.chunks
      .filter((c) => {
        if (input.kind !== undefined && c.kind !== input.kind) return false;
        if (input.excludeDocumentId !== undefined && c.documentId === input.excludeDocumentId)
          return false;
        if (input.excludeSectionKey !== undefined && c.sectionKey === input.excludeSectionKey)
          return false;
        const haystack = `${c.text} ${c.sectionTitle ?? ""} ${c.documentTitle}`.toLowerCase();
        return tokens.some((tok) => haystack.includes(tok));
      })
      .map((c) => {
        const haystack = `${c.text} ${c.sectionTitle ?? ""} ${c.documentTitle}`.toLowerCase();
        const matches = tokens.filter((tok) => haystack.includes(tok)).length;
        return {
          documentId: c.documentId,
          documentTitle: c.documentTitle,
          kind: c.kind,
          sectionKey: c.sectionKey,
          sectionTitle: c.sectionTitle,
          chunkIndex: c.chunkIndex,
          score: -matches,
          terms: tokens,
        };
      });
    ranked.sort((a, b) => a.score - b.score);
    return ranked.slice(0, limit);
  }

  // ---- Progress -----------------------------------------------------------
  async upsertProgress(input: {
    documentId: string;
    sectionKey: string;
    position: unknown | null;
    progressPercent: number | null;
  }): Promise<FakeProgressRow> {
    const now = Date.now();
    const existing = this.progress.get(input.documentId);
    const row: FakeProgressRow = {
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      position: input.position,
      progressPercent: input.progressPercent,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.progress.set(input.documentId, row);
    return row;
  }

  async getProgress(documentId: string): Promise<FakeProgressRow | null> {
    return this.progress.get(documentId) ?? null;
  }

  async listProgressByDocuments(documentIds: string[]): Promise<Map<string, FakeProgressRow>> {
    const out = new Map<string, FakeProgressRow>();
    for (const id of documentIds) {
      const row = this.progress.get(id);
      if (row) out.set(id, row);
    }
    return out;
  }

  private withProgress(row: FakeDocumentRow): FakeDocumentWithProgressRow {
    const progress = this.progress.get(row.documentId);
    return {
      ...row,
      progress: progress
        ? {
            sectionKey: progress.sectionKey,
            progressPercent: progress.progressPercent,
            updatedAt: progress.updatedAt,
          }
        : null,
    };
  }

  // ---- Highlights ---------------------------------------------------------
  async createHighlight(input: {
    highlightId: string;
    documentId: string;
    sectionKey: string;
    position: unknown;
    textSnippet: string;
    color: string;
  }): Promise<FakeHighlightRow> {
    const now = Date.now();
    const row: FakeHighlightRow = {
      highlightId: input.highlightId,
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      position: input.position,
      textSnippet: input.textSnippet,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    };
    this.highlights.set(input.highlightId, row);
    return row;
  }

  async getHighlight(highlightId: string): Promise<FakeHighlightRow | null> {
    return this.highlights.get(highlightId) ?? null;
  }

  async listHighlights(input: {
    documentId: string;
    sectionKey?: string;
  }): Promise<FakeHighlightRow[]> {
    return [...this.highlights.values()]
      .filter(
        (r) =>
          r.documentId === input.documentId &&
          (input.sectionKey === undefined || r.sectionKey === input.sectionKey),
      )
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async listHighlightsAll(input: {
    documentId?: string;
    limit?: number;
  }): Promise<FakeHighlightRow[]> {
    const limit = input.limit ?? 50;
    const filtered = [...this.highlights.values()].filter(
      (r) => input.documentId === undefined || r.documentId === input.documentId,
    );
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return filtered.slice(0, limit);
  }

  async updateHighlight(input: {
    highlightId: string;
    color?: string;
  }): Promise<FakeHighlightRow | null> {
    const row = this.highlights.get(input.highlightId);
    if (!row) return null;
    if (input.color !== undefined) row.color = input.color;
    row.updatedAt = Date.now();
    return row;
  }

  async removeHighlight(highlightId: string): Promise<boolean> {
    const existed = this.highlights.delete(highlightId);
    for (const [id, row] of this.notes) {
      if (row.highlightId === highlightId) this.notes.delete(id);
    }
    return existed;
  }

  // ---- Notes --------------------------------------------------------------
  async createNote(input: {
    noteId: string;
    documentId: string;
    sectionKey: string | null;
    highlightId: string | null;
    body: string;
  }): Promise<FakeNoteRow> {
    const now = Date.now();
    const row: FakeNoteRow = {
      noteId: input.noteId,
      documentId: input.documentId,
      sectionKey: input.sectionKey,
      highlightId: input.highlightId,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    this.notes.set(input.noteId, row);
    return row;
  }

  async getNote(noteId: string): Promise<FakeNoteRow | null> {
    return this.notes.get(noteId) ?? null;
  }

  async listNotes(input: {
    documentId: string;
    sectionKey?: string;
    highlightId?: string;
    unanchored?: boolean;
  }): Promise<FakeNoteRow[]> {
    return [...this.notes.values()]
      .filter((r) => {
        if (r.documentId !== input.documentId) return false;
        if (input.sectionKey !== undefined && r.sectionKey !== input.sectionKey) return false;
        if (input.highlightId !== undefined && r.highlightId !== input.highlightId) return false;
        if (input.unanchored === true && (r.sectionKey !== null || r.highlightId !== null)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async listNotesAll(input: { documentId?: string; limit?: number }): Promise<FakeNoteRow[]> {
    const limit = input.limit ?? 50;
    const filtered = [...this.notes.values()].filter(
      (r) => input.documentId === undefined || r.documentId === input.documentId,
    );
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return filtered.slice(0, limit);
  }

  async updateNote(input: { noteId: string; body?: string }): Promise<FakeNoteRow | null> {
    const row = this.notes.get(input.noteId);
    if (!row) return null;
    if (input.body !== undefined) row.body = input.body;
    row.updatedAt = Date.now();
    return row;
  }

  async removeNote(noteId: string): Promise<boolean> {
    return this.notes.delete(noteId);
  }

  // ---- Shelves ------------------------------------------------------------
  #countShelfMembers(shelfId: string): number {
    return this.shelfMemberships.filter((m) => m.shelfId === shelfId).length;
  }

  async createShelf(input: {
    shelfId: string;
    name: string;
    description: string | null;
  }): Promise<FakeShelfRowWithCount> {
    const now = Date.now();
    const row: FakeShelfRow = {
      shelfId: input.shelfId,
      name: input.name,
      description: input.description,
      position: null,
      createdAt: now,
      updatedAt: now,
    };
    this.shelves.set(input.shelfId, row);
    return { ...row, itemCount: 0 };
  }

  async listShelves(): Promise<FakeShelfRowWithCount[]> {
    const rows = [...this.shelves.values()];
    rows.sort((a, b) => {
      const aNull = a.position === null ? 1 : 0;
      const bNull = b.position === null ? 1 : 0;
      if (aNull !== bNull) return aNull - bNull;
      if (a.position !== null && b.position !== null && a.position !== b.position) {
        return a.position - b.position;
      }
      return a.createdAt - b.createdAt;
    });
    return rows.map((r) => ({ ...r, itemCount: this.#countShelfMembers(r.shelfId) }));
  }

  async getShelf(shelfId: string): Promise<FakeShelfRowWithCount | null> {
    const row = this.shelves.get(shelfId);
    if (!row) return null;
    return { ...row, itemCount: this.#countShelfMembers(shelfId) };
  }

  async shelfExists(shelfId: string): Promise<boolean> {
    return this.shelves.has(shelfId);
  }

  async findShelfByLowerName(nameLower: string): Promise<{ shelfId: string } | null> {
    for (const row of this.shelves.values()) {
      if (row.name.toLowerCase() === nameLower) return { shelfId: row.shelfId };
    }
    return null;
  }

  async updateShelf(input: {
    shelfId: string;
    name?: string;
    description?: string | null;
    position?: number | null;
  }): Promise<FakeShelfRowWithCount | null> {
    const row = this.shelves.get(input.shelfId);
    if (!row) return null;
    if (input.name !== undefined) row.name = input.name;
    if (input.description !== undefined) row.description = input.description;
    if (input.position !== undefined) row.position = input.position;
    row.updatedAt = Date.now();
    return { ...row, itemCount: this.#countShelfMembers(input.shelfId) };
  }

  async removeShelf(shelfId: string): Promise<boolean> {
    const existed = this.shelves.has(shelfId);
    this.shelves.delete(shelfId);
    for (let i = this.shelfMemberships.length - 1; i >= 0; i--) {
      if (this.shelfMemberships[i]!.shelfId === shelfId) this.shelfMemberships.splice(i, 1);
    }
    return existed;
  }

  async addShelfDocument(input: { shelfId: string; documentId: string }): Promise<void> {
    const exists = this.shelfMemberships.some(
      (m) => m.shelfId === input.shelfId && m.documentId === input.documentId,
    );
    if (exists) return;
    this.shelfMemberships.push({
      shelfId: input.shelfId,
      documentId: input.documentId,
      position: null,
      addedAt: Date.now(),
    });
  }

  async removeShelfDocument(input: { shelfId: string; documentId: string }): Promise<boolean> {
    const idx = this.shelfMemberships.findIndex(
      (m) => m.shelfId === input.shelfId && m.documentId === input.documentId,
    );
    if (idx < 0) return false;
    this.shelfMemberships.splice(idx, 1);
    return true;
  }

  async updateShelfMembershipPosition(input: {
    shelfId: string;
    documentId: string;
    position: number | null;
  }): Promise<boolean> {
    const member = this.shelfMemberships.find(
      (m) => m.shelfId === input.shelfId && m.documentId === input.documentId,
    );
    if (!member) return false;
    member.position = input.position;
    return true;
  }

  async listShelfDocuments(shelfId: string): Promise<FakeDocumentWithProgressRow[]> {
    const members = this.shelfMemberships
      .filter((m) => m.shelfId === shelfId)
      .sort((a, b) => {
        const aNull = a.position === null ? 1 : 0;
        const bNull = b.position === null ? 1 : 0;
        if (aNull !== bNull) return aNull - bNull;
        if (a.position !== null && b.position !== null && a.position !== b.position) {
          return a.position - b.position;
        }
        return a.addedAt - b.addedAt;
      });
    const out: FakeDocumentWithProgressRow[] = [];
    for (const m of members) {
      const doc = this.documents.get(m.documentId);
      if (!doc) continue;
      const p = this.progress.get(m.documentId);
      out.push({
        ...doc,
        progress: p
          ? { sectionKey: p.sectionKey, progressPercent: p.progressPercent, updatedAt: p.updatedAt }
          : null,
      });
    }
    return out;
  }

  async smartCounts(): Promise<{ reading: number; finished: number }> {
    let reading = 0;
    let finished = 0;
    for (const p of this.progress.values()) {
      if (p.progressPercent === 1) finished++;
      else reading++;
    }
    return { reading, finished };
  }

  async smartDocuments(smartType: "reading" | "finished"): Promise<FakeDocumentWithProgressRow[]> {
    const filtered = [...this.progress.values()].filter((p) =>
      smartType === "finished"
        ? p.progressPercent === 1
        : p.progressPercent === null || p.progressPercent < 1,
    );
    filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    const out: FakeDocumentWithProgressRow[] = [];
    for (const p of filtered) {
      const doc = this.documents.get(p.documentId);
      if (!doc) continue;
      out.push({
        ...doc,
        progress: {
          sectionKey: p.sectionKey,
          progressPercent: p.progressPercent,
          updatedAt: p.updatedAt,
        },
      });
    }
    return out;
  }

  async shelvesForDocument(documentId: string): Promise<FakeShelfRowWithCount[]> {
    const shelfIds = new Set(
      this.shelfMemberships.filter((m) => m.documentId === documentId).map((m) => m.shelfId),
    );
    const rows: FakeShelfRow[] = [];
    for (const id of shelfIds) {
      const row = this.shelves.get(id);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => {
      const aNull = a.position === null ? 1 : 0;
      const bNull = b.position === null ? 1 : 0;
      if (aNull !== bNull) return aNull - bNull;
      if (a.position !== null && b.position !== null && a.position !== b.position) {
        return a.position - b.position;
      }
      return a.createdAt - b.createdAt;
    });
    return rows.map((r) => ({ ...r, itemCount: this.#countShelfMembers(r.shelfId) }));
  }

  // ---- Conversations ------------------------------------------------------
  readonly conversations = new Map<string, FakeConversationRow>();

  async createConversation(input: {
    conversationId: string;
    title: string;
    primaryDocumentId: string | null;
  }): Promise<FakeConversationRow> {
    const now = Date.now();
    const row: FakeConversationRow = {
      conversationId: input.conversationId,
      title: input.title,
      primaryDocumentId: input.primaryDocumentId,
      createdAt: now,
      lastActivityAt: now,
    };
    this.conversations.set(input.conversationId, row);
    return row;
  }

  async getConversation(conversationId: string): Promise<FakeConversationRow | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async listConversations(): Promise<FakeConversationRow[]> {
    return [...this.conversations.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  async updateConversation(input: {
    conversationId: string;
    title?: string;
  }): Promise<FakeConversationRow | null> {
    const row = this.conversations.get(input.conversationId);
    if (!row) return null;
    if (input.title !== undefined) row.title = input.title;
    return row;
  }

  async touchConversation(conversationId: string): Promise<FakeConversationRow | null> {
    const row = this.conversations.get(conversationId);
    if (!row) return null;
    row.lastActivityAt = Date.now();
    return row;
  }

  async removeConversation(conversationId: string): Promise<boolean> {
    return this.conversations.delete(conversationId);
  }
}

type FakeConversationRow = {
  conversationId: string;
  title: string;
  primaryDocumentId: string | null;
  createdAt: number;
  lastActivityAt: number;
};

const createFakeBinderBinding = (): DurableObjectNamespace => {
  const binders = new Map<string, FakeBinder>();
  const fake = {
    idFromName: (name: string) => ({ __name: name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const name = (id as unknown as { __name: string }).__name;
      let binder = binders.get(name);
      if (!binder) {
        binder = new FakeBinder();
        binders.set(name, binder);
      }
      return binder as unknown as DurableObjectStub;
    },
  };
  return fake as unknown as DurableObjectNamespace;
};

// Workflow binding fake. `Document.create` calls `Processor.trigger`, which
// hits the binding's `create`. Production enqueues a workflow run that
// proceeds asynchronously; here we run `runEpubInline` synchronously so
// the document row is in its terminal state by the time `Document.create`
// returns. `runEpubInline` already wraps its body in try/catch + markFailed,
// so the post-trigger state matches production for both happy and parse-
// failure paths.
const createFakeEpubProcessor = (): Workflow => {
  const fake = {
    create: async (init: { id?: string; params: { userId: string; documentId: string } }) => {
      await runEpubInline(init.params.userId, init.params.documentId);
      return { id: init.id ?? init.params.documentId };
    },
  };
  return fake as unknown as Workflow;
};

// DocumentDO binding fake. Phase 2 ingest writes per-section chunks to
// DocumentDO; deletion calls .destroy(). One in-memory FakeDocument per
// documentId. Tracks meta + chunks so tests can assert indexing happened
// and survives the destroy-on-deletion path.
type FakeChunk = {
  sectionKey: string;
  sectionOrder: number;
  sectionTitle: string | null;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  textPath: string;
  text: string;
};

class FakeDocument {
  meta: {
    documentId: string;
    userId: string;
    kind: string;
    manifestKey: string;
    contentHash: string;
  } | null = null;
  sections = new Map<
    string,
    { sectionOrder: number; title: string | null; wordCount: number; textPath: string }
  >();
  chunks: FakeChunk[] = [];
  destroyed = false;

  async init(input: {
    documentId: string;
    userId: string;
    kind: string;
    manifestKey: string;
    contentHash: string;
  }): Promise<void> {
    this.meta = { ...input };
  }

  async getMeta(): Promise<{
    documentId: string | null;
    userId: string | null;
    kind: string | null;
    manifestKey: string | null;
    contentHash: string | null;
  }> {
    if (!this.meta) {
      return {
        documentId: null,
        userId: null,
        kind: null,
        manifestKey: null,
        contentHash: null,
      };
    }
    return this.meta;
  }

  async indexChunks(input: {
    sections: Array<{
      sectionKey: string;
      sectionOrder: number;
      title: string | null;
      wordCount: number;
      textPath: string;
    }>;
    chunks: FakeChunk[];
  }): Promise<void> {
    for (const s of input.sections) {
      this.sections.set(s.sectionKey, {
        sectionOrder: s.sectionOrder,
        title: s.title,
        wordCount: s.wordCount,
        textPath: s.textPath,
      });
    }
    for (const c of input.chunks) {
      const existing = this.chunks.findIndex(
        (x) => x.sectionKey === c.sectionKey && x.chunkIndex === c.chunkIndex,
      );
      if (existing >= 0) this.chunks[existing] = c;
      else this.chunks.push(c);
    }
  }

  // Page through chunks for a section. Mirrors DocumentStore.readSection.
  async readSection(input: { sectionKey: string; offset?: number; limit?: number }): Promise<{
    sectionKey: string;
    chunks: Array<{
      sectionKey: string;
      sectionTitle: string | null;
      chunkIndex: number;
      startOffset: number;
      endOffset: number;
      text: string;
    }>;
  }> {
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 50;
    const matches = this.chunks
      .filter((c) => c.sectionKey === input.sectionKey)
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .slice(offset, offset + limit)
      .map((c) => ({
        sectionKey: c.sectionKey,
        sectionTitle: c.sectionTitle,
        chunkIndex: c.chunkIndex,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        text: c.text,
      }));
    return { sectionKey: input.sectionKey, chunks: matches };
  }

  // Chunk lookup for snippet rendering. When `terms` are supplied, wrap the
  // first matching token in <mark> tags so route tests can assert highlight
  // semantics without invoking real FTS5.
  async getChunkSnippet(input: {
    sectionKey: string;
    chunkIndex: number;
    terms?: string[];
  }): Promise<{
    sectionKey: string;
    sectionTitle: string | null;
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
    text: string;
  } | null> {
    const c = this.chunks.find(
      (x) => x.sectionKey === input.sectionKey && x.chunkIndex === input.chunkIndex,
    );
    if (!c) return null;
    let text = c.text;
    if (input.terms && input.terms.length > 0) {
      for (const term of input.terms) {
        const tok = term.toLowerCase();
        if (!tok) continue;
        const idx = text.toLowerCase().indexOf(tok);
        if (idx >= 0) {
          text = `${text.slice(0, idx)}<mark>${text.slice(idx, idx + tok.length)}</mark>${text.slice(idx + tok.length)}`;
          break;
        }
      }
    }
    return {
      sectionKey: c.sectionKey,
      sectionTitle: c.sectionTitle,
      chunkIndex: c.chunkIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      text,
    };
  }

  // Substring-based search; same shape as DocumentStore.search. Score is
  // `-matches` so smaller is better (matches production bm25 ordering).
  async search(input: { query: string; limit?: number }): Promise<
    Array<{
      sectionKey: string;
      sectionTitle: string | null;
      chunkIndex: number;
      startOffset: number;
      endOffset: number;
      score: number;
      snippet: string;
    }>
  > {
    const tokens = input.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length === 0) return [];
    const limit = input.limit ?? 10;
    const ranked = this.chunks
      .filter((c) => tokens.some((t) => c.text.toLowerCase().includes(t)))
      .map((c) => {
        const matches = tokens.filter((t) => c.text.toLowerCase().includes(t)).length;
        let snippet = c.text;
        for (const tok of tokens) {
          const idx = snippet.toLowerCase().indexOf(tok);
          if (idx >= 0) {
            snippet = `${snippet.slice(0, idx)}<mark>${snippet.slice(idx, idx + tok.length)}</mark>${snippet.slice(idx + tok.length)}`;
            break;
          }
        }
        return {
          sectionKey: c.sectionKey,
          sectionTitle: c.sectionTitle,
          chunkIndex: c.chunkIndex,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          score: -matches,
          snippet,
        };
      });
    ranked.sort((a, b) => a.score - b.score);
    return ranked.slice(0, limit);
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.meta = null;
    this.sections.clear();
    this.chunks = [];
  }
}

const createFakeDocumentBinding = (): DurableObjectNamespace => {
  const docs = new Map<string, FakeDocument>();
  const fake = {
    idFromName: (name: string) => ({ __name: name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const name = (id as unknown as { __name: string }).__name;
      let doc = docs.get(name);
      if (!doc) {
        doc = new FakeDocument();
        docs.set(name, doc);
      }
      return doc as unknown as DurableObjectStub;
    },
  };
  return fake as unknown as DurableObjectNamespace;
};

// DELETE_DOCUMENT workflow fake. `Document.remove` calls
// `DocumentDeletion.trigger`, which hits the binding's `create`. Production
// enqueues an async workflow run; here we run `runDeletionInline`
// synchronously so post-trigger state matches the production end state by
// the time `Document.remove` returns.
const createFakeDeleteDocumentBinding = (): Workflow => {
  const fake = {
    create: async (init: { id?: string; params: { userId: string; documentId: string } }) => {
      await runDeletionInline(init.params);
      return { id: init.id ?? `delete-${init.params.documentId}` };
    },
  };
  return fake as unknown as Workflow;
};
