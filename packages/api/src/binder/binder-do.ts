import { DurableObject } from "cloudflare:workers";
import type { RuntimeEnv } from "../app/context";
import {
  BinderStore,
  type BinderSearchHit,
  type BinderSearchInput,
  type ConversationCreateInput,
  type ConversationRow,
  type ConversationUpdateInput,
  type CreateDocumentInput,
  type DocumentRow,
  type DocumentWithProgressRow,
  type HighlightCreateInput,
  type HighlightRow,
  type MarkDocumentProcessedInput,
  type NoteCreateInput,
  type NoteRow,
  type ProgressInput,
  type ProgressRow,
  type ShelfCreateInput,
  type ShelfRowWithCount,
  type UpdateDocumentInput,
} from "./binder-store";

// Per-user binder aggregate. Source of truth for the catalog, shelves,
// progress, highlights, notes, conversation metadata, and the cross-binder
// FTS index. See `.agents/ai-layer-prd.md` §9.
//
// Identity is `idFromName(userId)` — deterministic, never `newUniqueId`.
//
// This file is a thin DO wrapper around `BinderStore`. `BinderStore` itself
// is a composition over per-feature stores (`note/note-store.ts`,
// `highlight/highlight-store.ts`, `progress/progress-store.ts`, etc.) that
// each own the SQL for their tables. None of those modules depend on
// `cloudflare:workers`, so they can be unit-tested against an in-memory
// sqlite shim. The Worker-side accessor lives in `./binder.ts`.

export class BinderDO extends DurableObject<RuntimeEnv> {
  #store: BinderStore;

  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    this.#store = new BinderStore(ctx.storage.sql);
  }

  // No-op aside from forcing DO instantiation; used by callers that want to
  // ensure the schema is set up before issuing concurrent RPCs.
  async init(): Promise<void> {}

  async createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
    return this.#store.createDocument(input);
  }

  async getDocument(documentId: string): Promise<DocumentRow | null> {
    return this.#store.getDocument(documentId);
  }

  async getDocumentWithProgress(documentId: string): Promise<DocumentWithProgressRow | null> {
    return this.#store.getDocumentWithProgress(documentId);
  }

  async listDocuments(): Promise<DocumentRow[]> {
    return this.#store.listDocuments();
  }

  async listDocumentsWithProgress(): Promise<DocumentWithProgressRow[]> {
    return this.#store.listDocumentsWithProgress();
  }

  async updateDocument(input: UpdateDocumentInput): Promise<DocumentRow | null> {
    return this.ctx.storage.transactionSync(() => this.#store.updateDocument(input));
  }

  async markDocumentProcessed(input: MarkDocumentProcessedInput): Promise<void> {
    this.#store.markDocumentProcessed(input);
  }

  async markDocumentFailed(input: { documentId: string; reason: string }): Promise<void> {
    this.#store.markDocumentFailed(input);
  }

  async removeDocument(documentId: string): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.#store.removeDocument(documentId);
    });
  }

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
    this.ctx.storage.transactionSync(() => {
      this.#store.indexDocumentChunks(input);
    });
  }

  async search(input: BinderSearchInput): Promise<BinderSearchHit[]> {
    return this.#store.search(input);
  }

  // ---------------- Progress -------------------------------------------------
  async upsertProgress(input: ProgressInput): Promise<ProgressRow> {
    return this.#store.upsertProgress(input);
  }

  async getProgress(documentId: string): Promise<ProgressRow | null> {
    return this.#store.getProgress(documentId);
  }

  async listProgressByDocuments(documentIds: string[]): Promise<Map<string, ProgressRow>> {
    return this.#store.listProgressByDocuments(documentIds);
  }

  // ---------------- Highlights -----------------------------------------------
  async createHighlight(input: HighlightCreateInput): Promise<HighlightRow> {
    return this.#store.createHighlight(input);
  }

  async getHighlight(highlightId: string): Promise<HighlightRow | null> {
    return this.#store.getHighlight(highlightId);
  }

  async listHighlights(input: {
    documentId: string;
    sectionKey?: string;
  }): Promise<HighlightRow[]> {
    return this.#store.listHighlights(input);
  }

  async listHighlightsAll(input: { documentId?: string; limit?: number }): Promise<HighlightRow[]> {
    return this.#store.listHighlightsAll(input);
  }

  async updateHighlight(input: {
    highlightId: string;
    color?: string;
  }): Promise<HighlightRow | null> {
    return this.#store.updateHighlight(input);
  }

  async removeHighlight(highlightId: string): Promise<boolean> {
    return this.ctx.storage.transactionSync(() => this.#store.removeHighlight(highlightId));
  }

  // ---------------- Notes ----------------------------------------------------
  async createNote(input: NoteCreateInput): Promise<NoteRow> {
    return this.#store.createNote(input);
  }

  async getNote(noteId: string): Promise<NoteRow | null> {
    return this.#store.getNote(noteId);
  }

  async listNotes(input: {
    documentId: string;
    sectionKey?: string;
    highlightId?: string;
    unanchored?: boolean;
  }): Promise<NoteRow[]> {
    return this.#store.listNotes(input);
  }

  async listNotesAll(input: { documentId?: string; limit?: number }): Promise<NoteRow[]> {
    return this.#store.listNotesAll(input);
  }

  async updateNote(input: { noteId: string; body?: string }): Promise<NoteRow | null> {
    return this.#store.updateNote(input);
  }

  async removeNote(noteId: string): Promise<boolean> {
    return this.#store.removeNote(noteId);
  }

  // ---------------- Shelves --------------------------------------------------
  async createShelf(input: ShelfCreateInput): Promise<ShelfRowWithCount> {
    const row = this.#store.createShelf(input);
    return row;
  }

  async listShelves(): Promise<ShelfRowWithCount[]> {
    return this.#store.listShelves();
  }

  async getShelf(shelfId: string): Promise<ShelfRowWithCount | null> {
    return this.#store.getShelf(shelfId);
  }

  async shelfExists(shelfId: string): Promise<boolean> {
    return this.#store.shelfExists(shelfId);
  }

  async findShelfByLowerName(nameLower: string): Promise<{ shelfId: string } | null> {
    return this.#store.findShelfByLowerName(nameLower);
  }

  async updateShelf(input: {
    shelfId: string;
    name?: string;
    description?: string | null;
    position?: number | null;
  }): Promise<ShelfRowWithCount | null> {
    return this.#store.updateShelf(input);
  }

  async removeShelf(shelfId: string): Promise<boolean> {
    return this.ctx.storage.transactionSync(() => this.#store.removeShelf(shelfId));
  }

  async addShelfDocument(input: { shelfId: string; documentId: string }): Promise<void> {
    this.#store.addShelfDocument(input);
  }

  async removeShelfDocument(input: { shelfId: string; documentId: string }): Promise<boolean> {
    return this.#store.removeShelfDocument(input);
  }

  async updateShelfMembershipPosition(input: {
    shelfId: string;
    documentId: string;
    position: number | null;
  }): Promise<boolean> {
    return this.#store.updateShelfMembershipPosition(input);
  }

  async listShelfDocuments(shelfId: string): Promise<DocumentWithProgressRow[]> {
    return this.#store.listShelfDocuments(shelfId);
  }

  async smartCounts(): Promise<{ reading: number; finished: number }> {
    return this.#store.smartCounts();
  }

  async smartDocuments(smartType: "reading" | "finished"): Promise<DocumentWithProgressRow[]> {
    return this.#store.smartDocuments(smartType);
  }

  async shelvesForDocument(documentId: string): Promise<ShelfRowWithCount[]> {
    return this.#store.shelvesForDocument(documentId);
  }

  // ---------------- Conversations -------------------------------------------
  async createConversation(input: ConversationCreateInput): Promise<ConversationRow> {
    return this.#store.createConversation(input);
  }

  async getConversation(conversationId: string): Promise<ConversationRow | null> {
    return this.#store.getConversation(conversationId);
  }

  async listConversations(): Promise<ConversationRow[]> {
    return this.#store.listConversations();
  }

  async updateConversation(input: ConversationUpdateInput): Promise<ConversationRow | null> {
    return this.#store.updateConversation(input);
  }

  async touchConversation(conversationId: string): Promise<ConversationRow | null> {
    return this.#store.touchConversation(conversationId);
  }

  async removeConversation(conversationId: string): Promise<boolean> {
    return this.#store.removeConversation(conversationId);
  }
}
