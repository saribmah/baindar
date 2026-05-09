// Composite facade over the per-feature stores that share a BinderDO's
// SqlStorage. This file owns no SQL of its own — each feature's store
// (`<feature>/<feature>-store.ts`) holds the queries; this class wires
// them to a single SqlStorage handle, runs the schema migrations once,
// and exposes a flat method surface so callers (tests, the BinderDO RPC
// wrapper) don't need to reach into individual stores.

import { ConversationStore } from "../conversation/conversation-store";
import { BinderDocumentStore } from "../document/binder-document-store";
import { HighlightStore } from "../highlight/highlight-store";
import { NoteStore } from "../note/note-store";
import { ProgressStore } from "../progress/progress-store";
import { ShelfStore } from "../shelf/shelf-store";
import { runSqlMigrations } from "../utils/sqlite-migrations";
import { BinderSearchStore } from "./binder-search-store";
import { binderMigrations } from "./migrations";

import type {
  ConversationCreateInput,
  ConversationRow,
  ConversationUpdateInput,
} from "../conversation/conversation-store";
import type {
  CreateDocumentInput,
  DocumentRow,
  DocumentWithProgressRow,
  MarkDocumentProcessedInput,
  UpdateDocumentInput,
} from "../document/binder-document-store";
import type { HighlightCreateInput, HighlightRow } from "../highlight/highlight-store";
import type { NoteCreateInput, NoteRow } from "../note/note-store";
import type { ProgressInput, ProgressRow } from "../progress/progress-store";
import type { ShelfCreateInput, ShelfRow, ShelfRowWithCount } from "../shelf/shelf-store";
import type { BinderSearchHit, BinderSearchInput } from "./binder-search-store";

export type {
  BinderSearchHit,
  BinderSearchInput,
  ConversationCreateInput,
  ConversationRow,
  ConversationUpdateInput,
  CreateDocumentInput,
  DocumentRow,
  DocumentWithProgressRow,
  HighlightCreateInput,
  HighlightRow,
  MarkDocumentProcessedInput,
  NoteCreateInput,
  NoteRow,
  ProgressInput,
  ProgressRow,
  ShelfCreateInput,
  ShelfRow,
  ShelfRowWithCount,
  UpdateDocumentInput,
};
export type { PositionPayload } from "../progress/table";

export class BinderStore {
  readonly documents: BinderDocumentStore;
  readonly progress: ProgressStore;
  readonly highlights: HighlightStore;
  readonly notes: NoteStore;
  readonly shelves: ShelfStore;
  readonly conversations: ConversationStore;
  readonly searchStore: BinderSearchStore;

  constructor(sql: SqlStorage) {
    runSqlMigrations(sql, binderMigrations, "BinderStore");
    this.documents = new BinderDocumentStore(sql);
    this.progress = new ProgressStore(sql);
    this.highlights = new HighlightStore(sql);
    this.notes = new NoteStore(sql);
    this.shelves = new ShelfStore(sql);
    this.conversations = new ConversationStore(sql);
    this.searchStore = new BinderSearchStore(sql);
  }

  // ---------------- Documents -----------------------------------------------
  createDocument(input: CreateDocumentInput): DocumentRow {
    return this.documents.create(input);
  }
  getDocument(documentId: string): DocumentRow | null {
    return this.documents.get(documentId);
  }
  getDocumentWithProgress(documentId: string): DocumentWithProgressRow | null {
    return this.documents.getWithProgress(documentId);
  }
  listDocuments(): DocumentRow[] {
    return this.documents.list();
  }
  listDocumentsWithProgress(): DocumentWithProgressRow[] {
    return this.documents.listWithProgress();
  }
  updateDocument(input: UpdateDocumentInput): DocumentRow | null {
    return this.documents.update(input);
  }
  markDocumentProcessed(input: MarkDocumentProcessedInput): void {
    this.documents.markProcessed(input);
  }
  markDocumentFailed(input: { documentId: string; reason: string }): void {
    this.documents.markFailed(input);
  }
  removeDocument(documentId: string): void {
    this.documents.remove(documentId);
  }

  // ---------------- Cross-binder search ------------------------------------
  indexDocumentChunks(input: {
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
  }): void {
    this.searchStore.indexDocumentChunks(input);
  }
  search(input: BinderSearchInput): BinderSearchHit[] {
    return this.searchStore.search(input);
  }

  // ---------------- Progress -----------------------------------------------
  upsertProgress(input: ProgressInput): ProgressRow {
    return this.progress.upsert(input);
  }
  getProgress(documentId: string): ProgressRow | null {
    return this.progress.get(documentId);
  }
  listProgressByDocuments(documentIds: string[]): Map<string, ProgressRow> {
    return this.progress.listByDocuments(documentIds);
  }

  // ---------------- Highlights ---------------------------------------------
  createHighlight(input: HighlightCreateInput): HighlightRow {
    return this.highlights.create(input);
  }
  getHighlight(highlightId: string): HighlightRow | null {
    return this.highlights.get(highlightId);
  }
  listHighlights(input: { documentId: string; sectionKey?: string }): HighlightRow[] {
    return this.highlights.list(input);
  }
  listHighlightsAll(input: { documentId?: string; limit?: number }): HighlightRow[] {
    return this.highlights.listAll(input);
  }
  updateHighlight(input: { highlightId: string; color?: string }): HighlightRow | null {
    return this.highlights.update(input);
  }
  removeHighlight(highlightId: string): boolean {
    return this.highlights.remove(highlightId);
  }

  // ---------------- Notes --------------------------------------------------
  createNote(input: NoteCreateInput): NoteRow {
    return this.notes.create(input);
  }
  getNote(noteId: string): NoteRow | null {
    return this.notes.get(noteId);
  }
  listNotes(input: {
    documentId: string;
    sectionKey?: string;
    highlightId?: string;
    unanchored?: boolean;
  }): NoteRow[] {
    return this.notes.list(input);
  }
  listNotesAll(input: { documentId?: string; limit?: number }): NoteRow[] {
    return this.notes.listAll(input);
  }
  updateNote(input: { noteId: string; body?: string }): NoteRow | null {
    return this.notes.update(input);
  }
  removeNote(noteId: string): boolean {
    return this.notes.remove(noteId);
  }

  // ---------------- Shelves ------------------------------------------------
  createShelf(input: ShelfCreateInput): ShelfRowWithCount {
    return this.shelves.create(input);
  }
  listShelves(): ShelfRowWithCount[] {
    return this.shelves.list();
  }
  getShelf(shelfId: string): ShelfRowWithCount | null {
    return this.shelves.get(shelfId);
  }
  shelfExists(shelfId: string): boolean {
    return this.shelves.exists(shelfId);
  }
  findShelfByLowerName(nameLower: string): { shelfId: string } | null {
    return this.shelves.findByLowerName(nameLower);
  }
  updateShelf(input: {
    shelfId: string;
    name?: string;
    description?: string | null;
    position?: number | null;
  }): ShelfRowWithCount | null {
    return this.shelves.update(input);
  }
  removeShelf(shelfId: string): boolean {
    return this.shelves.remove(shelfId);
  }
  addShelfDocument(input: { shelfId: string; documentId: string }): void {
    this.shelves.addDocument(input);
  }
  removeShelfDocument(input: { shelfId: string; documentId: string }): boolean {
    return this.shelves.removeDocument(input);
  }
  updateShelfMembershipPosition(input: {
    shelfId: string;
    documentId: string;
    position: number | null;
  }): boolean {
    return this.shelves.updateMembershipPosition(input);
  }
  listShelfDocuments(shelfId: string): DocumentWithProgressRow[] {
    return this.shelves.listDocuments(shelfId);
  }
  smartCounts(): { reading: number; finished: number } {
    return this.shelves.smartCounts();
  }
  smartDocuments(smartType: "reading" | "finished"): DocumentWithProgressRow[] {
    return this.shelves.smartDocuments(smartType);
  }
  shelvesForDocument(documentId: string): ShelfRowWithCount[] {
    return this.shelves.shelvesForDocument(documentId);
  }

  // ---------------- Conversations ------------------------------------------
  createConversation(input: ConversationCreateInput): ConversationRow {
    return this.conversations.create(input);
  }
  getConversation(conversationId: string): ConversationRow | null {
    return this.conversations.get(conversationId);
  }
  listConversations(): ConversationRow[] {
    return this.conversations.list();
  }
  updateConversation(input: ConversationUpdateInput): ConversationRow | null {
    return this.conversations.update(input);
  }
  touchConversation(conversationId: string): ConversationRow | null {
    return this.conversations.touch(conversationId);
  }
  removeConversation(conversationId: string): boolean {
    return this.conversations.remove(conversationId);
  }
}
