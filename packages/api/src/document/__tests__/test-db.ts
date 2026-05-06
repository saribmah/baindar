import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AuthContext, RuntimeEnv } from "../../app/context";
import type { Db } from "../../db/db";
import { user } from "../../db/schema";
import { Instance } from "../../instance";
import { runEpubInline } from "../formats/epub/steps";

// Bun:sqlite-backed test harness for storage-touching feature tests.
//
// Type cast: Db is the production D1 Drizzle type. The bun-sqlite Drizzle
// instance has the same SQL builder surface (select/insert/update/delete) but
// a different concrete class, so we cast at the boundary. Storage code only
// uses the shared SQLite query builder API — no D1-specific methods like
// `.batch()` — so the cast is safe.
const migrationsFolder = path.resolve(import.meta.dir, "../../../migrations");

export type TestUser = { id: string; name: string; email: string };

export const createTestRuntime = (users: TestUser[]) => {
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
    ChatAgent: createFakeChatAgentBinding(destroyedConversationIds),
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
const createFakeChatAgentBinding = (destroyedIds: string[]): DurableObjectNamespace => {
  const fake = {
    idFromName: (name: string) => ({ __name: name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) => {
      const name = (id as unknown as { __name: string }).__name;
      return {
        destroy: async () => {
          destroyedIds.push(name);
        },
      } as unknown as DurableObjectStub;
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
    create: async (init: { id?: string; params: { documentId: string } }) => {
      await runEpubInline(init.params.documentId);
      return { id: init.id ?? init.params.documentId };
    },
  };
  return fake as unknown as Workflow;
};
