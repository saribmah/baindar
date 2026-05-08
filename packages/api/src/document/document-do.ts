import { DurableObject } from "cloudflare:workers";
import type { RuntimeEnv } from "../app/context";
import {
  DocumentStore,
  type ChunkSnippet,
  type DocumentMeta,
  type DocumentSearchHit,
  type IndexChunksInput,
  type InitInput,
} from "./document-store";

// Per-document content/search/summary actor. Derived from the R2 manifest
// and text files; rebuildable from them. See `.agents/ai-layer-prd.md` §10.
//
// Identity is `idFromName(documentId)` — deterministic, never `newUniqueId`.
//
// This file is a thin DO wrapper around `DocumentStore`. The store owns the
// schema and SQL bodies and has no `cloudflare:workers` dependency, so it
// can be unit-tested against an in-memory sqlite shim. The Worker-side
// accessor lives in `./document-binding.ts`.

export class DocumentDO extends DurableObject<RuntimeEnv> {
  #store: DocumentStore;

  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    this.#store = new DocumentStore(ctx.storage.sql);
  }

  async init(input: InitInput): Promise<void> {
    this.#store.init(input);
  }

  async getMeta(): Promise<DocumentMeta> {
    return this.#store.getMeta();
  }

  async indexChunks(input: IndexChunksInput): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.#store.indexChunks(input);
    });
  }

  async readSection(input: {
    sectionKey: string;
    offset?: number;
    limit?: number;
  }): Promise<{ sectionKey: string; chunks: ChunkSnippet[] }> {
    return this.#store.readSection(input);
  }

  async getChunkSnippet(input: {
    sectionKey: string;
    chunkIndex: number;
    terms?: string[];
  }): Promise<ChunkSnippet | null> {
    return this.#store.getChunkSnippet(input);
  }

  async search(input: { query: string; limit?: number }): Promise<DocumentSearchHit[]> {
    return this.#store.search(input);
  }

  // Wipes the DO's storage. Idempotent — DocumentDeletionWorkflow re-runs
  // can safely hit this on an already-cleared instance.
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
