# Baindar AI Layer PRD

**Status:** Draft v2, clean-slate architecture
**Audience:** Agents and engineers implementing Baindar's document AI layer
**Scope:** Backend architecture for binder storage, document search, and typed AI tools

## 1. Context

Baindar is a personal document binder. The current codebase is still in active
development, and development data can be wiped. This PRD therefore describes
the desired clean architecture, not a migration-compatible bridge from the
current D1-backed document tables.

The current repo already has the important file-layout foundation:

- `packages/api/src/document/asset-store.ts` writes document files to one R2
  bucket under `users/{userId}/documents/{documentId}/`.
- The EPUB workflow writes `original.*`, rendered `content/*.html`,
  `content/*.txt`, `assets/*`, and `manifest.json`.
- The current chat agent uses `runBash` through a sandbox mounted over R2.
  This PRD replaces that AI read/search path with typed tools backed by
  Durable Objects.

## 2. Product Principles

These are architectural constraints, not implementation preferences.

1. **R2 is the source of truth for document content.**
   Original document bytes, rendered HTML/text/assets, manifests, and AI
   summary artifacts are persisted to R2 in a stable layout. Binder state
   (catalog, shelves, progress, highlights, notes, conversation metadata)
   lives in BinderDO and is **not** mirrored to R2 in v1. Continuous binder
   write-through, on-demand export, and external rebuild are deferred to a
   later phase (see §16 and §18).

2. **No vector embeddings in v1.**
   Retrieval uses SQLite FTS5 plus optional LLM query expansion. Embeddings can
   be reconsidered later only if lexical search is proven insufficient.

3. **AI gets typed tools, not bash.**
   The AI should call `list_documents`, `search_document`, `search_binder`,
   `read_section`, `list_notes`, `list_highlights`, and `get_summary`.
   Containerized bash remains a later transformation/export capability, not the
   read/search/summarize path.

4. **No duplicate D1 document-domain source of truth.**
   D1 should not hold `document`, `highlight`, `note`, `progress`, `shelf`, or
   conversation catalog state while Durable Objects hold the same data. For the
   clean-slate version, binder-domain state moves to Durable Objects.

## 3. Goals

- Single-document Q&A.
- Cross-binder Q&A.
- Lexical search within one document and across the binder.
- Reading-context-aware answers.
- Lazy section and document summaries.
- User notes and highlights available to both the reader UI and the AI.
- Clean backend ownership boundaries that avoid D1-plus-DO cache drift.

## 4. Non-Goals

- Vector embeddings.
- Bash or mounted-bucket AI exploration.
- Cross-user collaboration.
- Backward-compatible migration from current development data.
- Eager summary generation during ingest.
- Non-EPUB implementation in the first pass, although the schema must remain
  format-ready.
- Continuous mirroring of binder state to R2 in v1.
- Binder export and external rebuild in v1.

## 5. Target Architecture

```text
Worker
  - Auth
  - HTTP validation and response mapping
  - Routes RPC calls to BinderDO, DocumentDO, and ChatAgent
  - Does not own binder-domain persistence

BinderDO(userId)
  - Source of truth for the user's binder runtime state
  - Document catalog
  - Shelves
  - Progress
  - Highlights
  - Notes
  - Conversation metadata
  - Cross-document FTS index

DocumentDO(documentId)
  - Per-document derived runtime state
  - Manifest metadata cache
  - Chunked per-document FTS
  - Read helpers over R2 text files
  - Summary cache with R2 write-through

R2
  - Source files and rendered content
  - Manifest files
  - Summary artifacts

D1
  - Auth and account/profile data only
  - No document-domain tables in the clean-slate target

Workflows
  - Format processors (e.g. EPUB_PROCESSOR) — drive ingest
  - DELETE_DOCUMENT — drives deletion across BinderDO, DocumentDO, and R2
```

### Durable Object identity

- `BinderDO`: `env.BINDER.get(env.BINDER.idFromName(userId))`
- `DocumentDO`: `env.DOCUMENT.get(env.DOCUMENT.idFromName(documentId))`
- `ChatAgent`:
  `env.ChatAgent.get(env.ChatAgent.idFromName(\`${userId}:${conversationId}\`))`.
  The composite name keeps tenancy in routing — a request with the wrong
  `userId` resolves to a different (empty) DO. Worker still validates
  ownership via `BinderDO.getConversation` before forwarding. Tools and
  transport are replaced (see §14); D1 ownership lookup is dropped.

Use deterministic IDs. Do not use `newUniqueId` for binder, document, or chat
routing.

## 6. Data Ownership

| Data | Runtime owner | Persisted to R2 | Notes |
| --- | --- | --- | --- |
| Original document bytes | R2 | Canonical | Existing layout already does this. |
| Rendered HTML/text/assets | R2 | Canonical | Existing EPUB workflow mostly matches. |
| Manifest | R2 | Canonical | Manifest is the API between R2 and DOs. |
| Document catalog | BinderDO | Deferred (v1.1+) | No D1 document table. Mirror to R2 deferred. |
| Shelves and membership | BinderDO | Deferred (v1.1+) | Keeps document grouping local to the user aggregate. |
| Reading progress | BinderDO | Deferred (v1.1+) | Enables dashboard and AI reading context without fanout. |
| Highlights | BinderDO | Deferred (v1.1+) | Binder-wide recent highlights stay cheap. |
| Notes | BinderDO | Deferred (v1.1+) | Binder-wide recent notes stay cheap. |
| Per-document FTS | DocumentDO | Derived; rebuildable from R2 (rebuild flow deferred) | Derived. |
| Cross-binder FTS | BinderDO | Derived; rebuildable from DocumentDOs (rebuild flow deferred) | Contentless FTS5; rebuild fans out per document. |
| Summaries | DocumentDO cache | Canonical artifacts in R2 | Expensive derived data, written through. |
| AI chat messages | ChatAgent storage | None in v1 | Transport concern, not document catalog. |
| Auth/profile | D1 | None | Better Auth and account data. |

## 7. R2 Layout

The current repo already uses the desired single-bucket prefix strategy. Keep
and extend it:

```text
users/{userId}/
  documents/{documentId}/
    original.{ext}
    manifest.json
    content/
      0006-chapter-1.html
      0006-chapter-1.txt
    assets/
      Image00023.jpg
    ai/
      summaries/
        section-{hash}.json
        document-{hash}.json
```

In v1, R2 holds only document-scoped artifacts under `documents/{documentId}/`.
There is no `binder/` subtree: continuous binder state mirroring and binder
export are deferred. See §16.

## 8. Manifest v2

The manifest remains the contract between R2 and DOs. It should be format-ready
and include enough data for rebuilds without listing R2.

```json
{
  "schemaVersion": 2,
  "kind": "epub",
  "documentId": "doc_...",
  "userId": "user_...",
  "processor": {
    "name": "baindar-epub",
    "version": "0.1.0"
  },
  "createdAt": "2026-05-07T00:00:00.000Z",
  "updatedAt": "2026-05-07T00:00:00.000Z",
  "contentHash": "sha256:...",
  "title": "Atomic Habits",
  "language": "en",
  "coverImage": "assets/cover.jpg",
  "chapterCount": 77,
  "wordCount": 77907,
  "source": {
    "original": "original.epub"
  },
  "content": {
    "basePath": "content",
    "assetsPath": "assets"
  },
  "ai": {
    "summariesPath": "ai/summaries"
  },
  "sections": [
    {
      "sectionKey": "epub:section:6",
      "order": 6,
      "title": "1: The Surprising Power of Atomic Habits",
      "wordCount": 3421,
      "linear": true,
      "href": "chapter1.xhtml",
      "files": {
        "html": "content/0006-chapter-1.html",
        "text": "content/0006-chapter-1.txt"
      }
    }
  ],
  "metadata": {},
  "toc": []
}
```

`contentHash` is the hash of the original bytes. It invalidates derived indexes
and summaries when a document is reprocessed.

## 9. BinderDO

### Responsibility

`BinderDO` is the aggregate root for one user's binder. It replaces the current
D1 document-domain tables in the clean-slate architecture.

It owns:

- document catalog and status
- shelves and shelf membership
- progress
- highlights
- notes
- conversation metadata
- binder-level AI session state
- cross-document search index

It does not own:

- original document bytes
- rendered document content
- per-document chunking details
- summary generation
- Better Auth account/session tables

### SQLite schema sketch

This is a starting schema, not a final migration file.

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE documents (
  document_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_reason TEXT,
  cover_image TEXT,
  source_url TEXT,
  original_key TEXT NOT NULL,
  manifest_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_documents_updated_at ON documents(updated_at);
CREATE INDEX idx_documents_status ON documents(status);

CREATE TABLE shelves (
  shelf_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  position REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_shelves_name_lower ON shelves(lower(name));

CREATE TABLE shelf_documents (
  shelf_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  position REAL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (shelf_id, document_id)
);
CREATE INDEX idx_shelf_documents_document ON shelf_documents(document_id);

CREATE TABLE progress (
  document_id TEXT PRIMARY KEY,
  section_key TEXT NOT NULL,
  position_json TEXT,
  progress_percent REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_progress_updated_at ON progress(updated_at);

CREATE TABLE highlights (
  highlight_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  position_json TEXT NOT NULL,
  text_snippet TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_highlights_document_section ON highlights(document_id, section_key);
CREATE INDEX idx_highlights_created_at ON highlights(created_at);

CREATE TABLE notes (
  note_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  section_key TEXT,
  highlight_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_document_section ON notes(document_id, section_key);
CREATE INDEX idx_notes_highlight ON notes(highlight_id);
CREATE INDEX idx_notes_created_at ON notes(created_at);

CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  primary_document_id TEXT,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL
);
CREATE INDEX idx_conversations_activity ON conversations(last_activity_at);

-- Cross-binder search uses contentless FTS5: BinderDO stores tokens only,
-- not chunk text. Chunk text lives once, in DocumentDO. This keeps BinderDO
-- well under the 10 GB per-DO ceiling for users with large binders.
CREATE TABLE binder_chunk_refs (
  rowid INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL,
  document_title TEXT NOT NULL,
  kind TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_title TEXT,
  section_order INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text_path TEXT NOT NULL
);
CREATE INDEX idx_binder_chunk_refs_document ON binder_chunk_refs(document_id);
CREATE INDEX idx_binder_chunk_refs_kind ON binder_chunk_refs(kind);
CREATE UNIQUE INDEX idx_binder_chunk_refs_unique
  ON binder_chunk_refs(document_id, section_key, chunk_index);

CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
  document_title,
  section_title,
  text,
  content='',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TABLE ai_session (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE _sql_schema_migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### RPC surface

```ts
class BinderDO extends DurableObject<Env> {
  async init(input: { userId: string }): Promise<void>;

  async createDocument(input: CreateDocumentInput): Promise<DocumentEntity>;
  async markDocumentProcessed(input: MarkProcessedInput): Promise<void>;
  async markDocumentFailed(input: { documentId: string; reason: string }): Promise<void>;
  async listDocuments(input?: DocumentListInput): Promise<DocumentEntity[]>;
  async getDocument(documentId: string): Promise<DocumentEntity | null>;
  async updateDocument(input: UpdateDocumentInput): Promise<DocumentEntity>;
  async removeDocument(documentId: string): Promise<void>;

  async createShelf(input: CreateShelfInput): Promise<ShelfEntity>;
  async listShelves(): Promise<ShelfEntity[]>;
  async addDocumentToShelf(input: ShelfDocumentInput): Promise<void>;
  async removeDocumentFromShelf(input: ShelfDocumentInput): Promise<void>;

  async upsertProgress(input: ProgressInput): Promise<ProgressEntity>;

  async createHighlight(input: HighlightCreateInput): Promise<HighlightEntity>;
  async listHighlights(input?: HighlightListInput): Promise<HighlightEntity[]>;
  async updateHighlight(input: HighlightUpdateInput): Promise<HighlightEntity>;
  async removeHighlight(highlightId: string): Promise<void>;

  async createNote(input: NoteCreateInput): Promise<NoteEntity>;
  async listNotes(input?: NoteListInput): Promise<NoteEntity[]>;
  async updateNote(input: NoteUpdateInput): Promise<NoteEntity>;
  async removeNote(noteId: string): Promise<void>;

  async indexDocumentChunks(input: IndexDocumentChunksInput): Promise<void>;
  async search(input: BinderSearchInput): Promise<BinderSearchHit[]>;

  async createConversation(input: CreateConversationInput): Promise<ConversationEntity>;
  async getConversation(conversationId: string): Promise<ConversationEntity | null>;
  async touchConversation(conversationId: string): Promise<void>;
  async removeConversation(conversationId: string): Promise<void>;
}
```

`removeDocument(documentId)` is called by `DocumentDeletionWorkflow`. In a
single transaction it deletes the `documents` row, all `binder_chunk_refs`
and `binder_chunks_fts` rows for the document, `shelf_documents` rows,
`highlights`, `notes`, `progress`, and sets
`conversations.primary_document_id = NULL` where it matched. Idempotent:
no-op if the `documents` row is already gone, so Workflow step replays are
safe.

`createConversation` generates the `conversationId` server-side; clients
never supply one. `getConversation(conversationId)` is the canonical
ownership check used by chat routes — it returns null when the conversation
does not belong to this BinderDO. `removeConversation(conversationId)`
deletes the binder-side row only; the chat route handler is responsible for
also calling `ChatAgent.destroy()` to clear the per-conversation DO storage.

### Contentless FTS5 write/read discipline

`binder_chunks_fts` uses `content=''`, so BinderDO does not store chunk text.
Index writes pass text in once for tokenization, then discard it:

```sql
INSERT INTO binder_chunk_refs(rowid, document_id, ...) VALUES (?, ?, ...);
INSERT INTO binder_chunks_fts(rowid, document_title, section_title, text)
  VALUES (?, ?, ?, ?);  -- text is tokenized, not stored
```

`binder_chunks_fts` cannot render `snippet()` because it has no stored
content. `BinderDO.search` returns ranked chunk references
(`document_id`, `section_key`, `chunk_index`, score, matched terms). The
worker (or AI tool wrapper) fans out to `DocumentDO.getChunkSnippet` for the
top-N hits to produce user-facing snippets. Default `limit` is 5–10, fan-out
runs in parallel.

When a document title changes, BinderDO updates `binder_chunk_refs.document_title`
and rebuilds affected FTS rows by `DELETE`+`INSERT` (contentless FTS does not
support in-place updates of indexed columns).

`removeDocument` (see RPC notes above) deletes both `binder_chunk_refs` and
`binder_chunks_fts` rows for the document as part of its single-transaction
cleanup.

`indexDocumentChunks` reads `kind` from the `documents` row at index time
and writes it into `binder_chunk_refs.kind`. Callers do not pass `kind`
in the input — the Workflow has already called `BinderDO.createDocument`
(ingest step 4) before any `indexDocumentChunks` call, so `documents.kind`
is guaranteed to be set.

### R2 write-through (deferred)

In v1, BinderDO does not write binder state to R2. Continuous mirroring,
on-demand export, and external rebuild are deferred (see §16). DO commits are
the only durability guarantee for binder state in v1.

Do not hold `blockConcurrencyWhile()` across long-running operations.
Constructor work is limited to schema setup and migration.

## 10. DocumentDO

### Responsibility

`DocumentDO` is the per-document content/search/summarization actor. It is
derived from the R2 manifest and text files, and can be rebuilt from them.

It owns:

- manifest metadata cache
- bounded text chunks
- per-document FTS
- read helpers by section and offset
- summary cache

It does not own:

- document catalog fields that power the dashboard
- shelves
- notes
- highlights
- progress
- conversation metadata

### Chunking rule

The user-visible unit remains a section, but the storage/index unit is a
bounded chunk.

Do not insert full chapters into one SQLite row. SQLite-backed Durable Objects
have a 2 MB maximum string, BLOB, or row size. Use bounded chunks, for example
6,000 to 12,000 characters, with overlap if needed for search quality.

Chunking is a pure function and does not live inside any DO. It lives in a
shared util (e.g. `packages/api/src/document/processing/chunk.ts`) called by
the format Workflow. The Workflow chunks each section once and fans the
result out to `DocumentDO.indexChunks` and `BinderDO.indexDocumentChunks` in
the same batch — text is not round-tripped between DOs.

Both `indexChunks` (DocumentDO) and `indexDocumentChunks` (BinderDO) MUST be
idempotent on `(section_key, chunk_index)` (and `(document_id, section_key,
chunk_index)` in BinderDO) so Workflow step replays do not duplicate or
corrupt index state. Use `INSERT ... ON CONFLICT ... DO UPDATE` for the
ref/chunk tables, and `DELETE`+`INSERT` by `rowid` for the contentless FTS
rows.

### SQLite schema sketch

```sql
CREATE TABLE document_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sections (
  section_key TEXT PRIMARY KEY,
  section_order INTEGER NOT NULL,
  title TEXT,
  word_count INTEGER,
  text_path TEXT NOT NULL
);
CREATE INDEX idx_sections_order ON sections(section_order);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key TEXT NOT NULL,
  section_order INTEGER NOT NULL,
  section_title TEXT,
  chunk_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text_path TEXT NOT NULL,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_chunks_unique ON chunks(section_key, chunk_index);
CREATE INDEX idx_chunks_section ON chunks(section_key);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  section_title,
  text,
  content='chunks',
  content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TABLE summaries (
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (target_type, target_key, content_hash)
);

CREATE TABLE _sql_schema_migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### RPC surface

```ts
class DocumentDO extends DurableObject<Env> {
  async init(input: {
    documentId: string;
    userId: string;
    kind: "epub";
    manifestKey: string;
    contentHash: string;
  }): Promise<void>;

  async indexChunks(input: {
    sections: Array<{
      sectionKey: string;
      sectionOrder: number;
      title: string | null;
      wordCount: number;
      textPath: string;
    }>;
    chunks: Array<{
      sectionKey: string;
      sectionOrder: number;
      sectionTitle: string | null;
      chunkIndex: number;
      startOffset: number;
      endOffset: number;
      textPath: string;
      text: string;
    }>;
  }): Promise<void>;

  async getManifest(): Promise<DocumentManifest>;
  async search(input: { query: string; limit?: number }): Promise<DocumentSearchHit[]>;
  async readSection(input: {
    sectionKey: string;
    offset?: number;
    limit?: number;
  }): Promise<ReadSectionResult>;
  async getChunkSnippet(input: {
    sectionKey: string;
    chunkIndex: number;
    terms: string[];
  }): Promise<{
    documentId: string;
    sectionKey: string;
    sectionTitle: string | null;
    chunkIndex: number;
    snippet: string;
  } | null>;
  async getOrGenerateSummary(input: SummaryInput): Promise<SummaryResult>;
  async destroy(): Promise<void>;
}
```

`destroy()` clears all DO storage (`ctx.storage.deleteAll()`). Idempotent;
called by `DocumentDeletionWorkflow`.

## 11. ChatAgent

`ChatAgent` keeps the existing Agents SDK transport (streaming chat, tool
loop) but replaces its toolset and ownership lookup. Identity is
`idFromName(\`${userId}:${conversationId}\`)`.

```ts
class ChatAgent extends Agent<Env> {
  async init(input: { userId: string; conversationId: string }): Promise<void>;
  async destroy(): Promise<void>;
  // Existing Agents SDK chat/streaming surface stays.
}
```

`init` is called once when a conversation is created; ChatAgent persists
`(userId, conversationId)` in its own storage so its typed tools can route
to `BinderDO`/`DocumentDO` using the stored `userId`. The model never
supplies `userId` — see §14.

`destroy` clears the DO storage and is called by the chat-deletion route
handler after `BinderDO.removeConversation`.

## 12. Ingest Flow

Clean-slate ingest should follow this sequence:

```text
1. Worker receives upload.
2. Worker validates auth and detects kind.
3. Worker writes original bytes to R2 using the existing prefix layout.
4. Worker calls BinderDO.createDocument(status = "processing").
5. Worker triggers the existing format Workflow.
6. Workflow parses and renders content to R2.
7. Workflow writes manifest v2 to R2 last.
8. Workflow calls DocumentDO.init({
     documentId, userId, kind, manifestKey, contentHash
   }).
9. Workflow walks the manifest's sections in batches. For each batch:
     a. Read the section text files from R2.
     b. chunks = chunkSection(text, opts)            // shared pure util
     c. DocumentDO.indexChunks({ sections, chunks }) // populates DocumentDO
     d. BinderDO.indexDocumentChunks({              // populates BinderDO
          documentId, chunks
        })
10. Workflow calls BinderDO.markDocumentProcessed().
```

Each batch in step 9 is its own Workflow step. Both `indexChunks` calls are
idempotent, so step replays are safe. Text passes through the worker once
per batch and is fanned out to both DOs without an extra round-trip.

On failure, the Workflow calls `BinderDO.markDocumentFailed(...)`.

Because development data will be wiped, no compatibility path is required for
old D1 document rows or schema v1 manifests.

### Reprocess (deferred)

In v1, re-uploading a document allocates a new `documentId`. Same-ID
reprocess (preserving highlights, notes, and progress under a changed
`contentHash`) is not supported in v1.

V1 design choices must not preclude same-ID reprocess later. When picked
up, the expected shape is:

- Make `DocumentDO.init` content-hash-aware: if stored `contentHash`
  differs, clear `sections` / `chunks` / `chunks_fts` in one transaction
  before re-indexing. `summaries` cache is left as-is (key includes
  `contentHash`, so old rows become unreachable).
- Add `BinderDO.beginIngestDocument({ documentId, contentHash })` —
  idempotent: clears `binder_chunk_refs` and `binder_chunks_fts` for the
  document and updates `documents.content_hash` when the hash differs.
- Format Workflow lists and deletes stale `content/`, `assets/`, and
  `ai/summaries/` from R2 before re-rendering.
- Address highlight/note/progress alignment as a separate concern (see
  §18). User-authored references may not survive content changes.

### Deletion flow

Document deletion is fully Workflow-driven, mirroring ingest. The route
handler validates and triggers; all cleanup happens in idempotent
Workflow steps.

```text
1. Worker receives DELETE /documents/:id.
2. Worker validates auth and ownership via BinderDO.getDocument.
3. Worker triggers DELETE_DOCUMENT Workflow with { userId, documentId }.
4. Worker returns 202.
---
DocumentDeletionWorkflow steps (each idempotent, retryable):
1. BinderDO.removeDocument(documentId)
     - one transaction: deletes documents row, binder_chunk_refs +
       binder_chunks_fts for the doc, shelf_documents, highlights,
       notes, progress; NULLs conversations.primary_document_id where
       it matched.
2. DocumentDO.destroy()
     - clears all DO storage.
3. R2 cleanup
     - list users/{userId}/documents/{documentId}/ recursively.
     - DeleteObjects in batches of up to 1000 keys until empty.
```

The document is gone from `listDocuments` after step 1 (typically <1s
after the DELETE call). Step replays are safe because each step's effect
is idempotent: re-running step 1 against an already-deleted doc is a
no-op, R2 deletes against missing keys are no-ops, and DO destroy on a
cleared DO is a no-op.

## 13. HTTP API Surface

Routes should keep the repo's route-feature boundary:

- route handlers parse, validate, authorize, and map errors
- feature modules remain transport-agnostic
- DO binding access goes through dedicated accessor modules, not direct random
  `Instance.env` reads

The exact paths can reuse current document/highlight/note routes where useful,
but storage should route to `BinderDO` and `DocumentDO`.

Recommended surface:

```text
POST   /documents
GET    /documents
GET    /documents/:id
PATCH  /documents/:id
DELETE /documents/:id
GET    /documents/:id/manifest
GET    /documents/:id/sections/:order/html
GET    /documents/:id/sections/:order/text
POST   /documents/:id/progress

POST   /highlights
GET    /highlights?documentId=&sectionKey=
PATCH  /highlights/:id
DELETE /highlights/:id

POST   /notes
GET    /notes?documentId=&sectionKey=&highlightId=
PATCH  /notes/:id
DELETE /notes/:id

POST   /ai/search
POST   /ai/read
POST   /ai/summarize

POST   /conversations
GET    /conversations
GET    /conversations/:id
DELETE /conversations/:id
```

For chat, prefer adapting the existing `ChatAgent` transport first:

- keep conversation UI and streaming behavior
- remove the `runBash` tool from `packages/api/src/agent/tools.ts`
- replace it with typed tools that call `BinderDO` and `DocumentDO`
- drop `requireOwnAgentInstance`'s D1 lookup in favor of
  `BinderDO.getConversation`
- switch ChatAgent identity to
  `idFromName(\`${userId}:${conversationId}\`)`

Canonical chat route shape:

```text
1. Authenticate request → userId.
2. BinderDO.getConversation(conversationId) → 404 if null (ownership check).
3. Resolve ChatAgent via composite-name idFromName.
4. Forward streaming chat call to ChatAgent.
5. After the stream, BinderDO.touchConversation(conversationId).
```

`POST /conversations` calls `BinderDO.createConversation(...)`, then
resolves the ChatAgent and calls `ChatAgent.init({ userId, conversationId })`.

`DELETE /conversations/:id` is synchronous in v1: validate ownership via
`BinderDO.getConversation`, call `BinderDO.removeConversation(id)`, then
call `ChatAgent.destroy()`. Smaller blast radius than document deletion (no
R2 to clean), so no Workflow needed in v1.

Only add a separate `/ai/chat` SSE route if the Agents SDK path blocks the
typed-tool architecture.

## 14. AI Tool Surface

Expose typed tools to the model:

```ts
const tools = {
  list_documents: {
    input: { limit?: number },
  },
  search_document: {
    input: { document_id: string; query: string; limit?: number },
  },
  search_binder: {
    input: {
      query: string;
      limit?: number;
      kind?: string;                    // filter by document kind, e.g. "epub", "pdf", "receipt"
      exclude_document_id?: string;
      exclude_section_key?: string;
    },
  },
  read_section: {
    input: {
      document_id: string;
      section_key: string;
      offset?: number;
      limit?: number;
    },
  },
  get_summary: {
    input: {
      document_id: string;
      target_type: "section" | "document";
      target_key: string;
      force?: boolean;
    },
  },
  list_notes: {
    input: { document_id?: string; limit?: number },
  },
  list_highlights: {
    input: { document_id?: string; limit?: number },
  },
  expand_query: {
    input: { original_query: string },
  },
};
```

### Reading context

Reading-context-aware answers do not require a `current_context` tool input.
The web/mobile/desktop UIs auto-attach a `MessageReference` data part
(`packages/api/src/agent/message-reference.ts`) to every user message,
encoding the user's current location (`book` / `passage` / `highlight` /
`note`) with `documentId`, `sectionKey`, `position`, and `previewText`. The
worker injects that reference into the model prompt via
`referenceToModelText`. The model then calls the typed tools below with the
relevant `document_id` / `section_key`.

The worker — never the model — supplies `userId` when routing tool calls to
`BinderDO`. AI tools never accept `user_id` as a parameter.

Tool dispatch rules:

- Cross-binder questions start with `search_binder`.
- Set `kind` on `search_binder` when the user clearly asks about a specific
  document type (e.g. "find my receipts", "what does the contract say").
  Discover available `kind` values from `list_documents` output.
- In-document questions start with `search_document`.
- Concept-style queries may call `expand_query` only after an empty or weak
  lexical search.
- Summary requests use `get_summary` before reading long text.
- Answers cite document title and section title.
- If search/read tools do not support an answer, say so.

Add a hard tool-round limit per response.

## 15. Summary Generation

Summaries are lazy.

DocumentDO checks the cache by:

```text
(targetType, targetKey, contentHash)
```

On cache miss:

1. Read the relevant section or document chunks.
2. Generate the summary with the configured LLM provider.
3. Insert into DocumentDO SQLite.
4. Write a summary JSON object to R2 under
   `users/{userId}/documents/{documentId}/ai/summaries/`.

Use one R2 object per summary instead of appending to a JSONL file.

## 16. Binder Export and Rebuild (Deferred)

Binder export, continuous binder state write-through to R2, and external
rebuild are explicitly deferred. They are not part of v1 scope.

Rationale: lock in the BinderDO/DocumentDO architecture, manifest v2, typed
AI tools, contentless cross-binder FTS, and lazy summaries first. Add
portability once the runtime shape is stable. Building portability against
a moving schema would generate churn and design backtracks.

When this work is picked up, the expected shape is:

- **Outbox in BinderDO** (`r2_outbox` table) with `coalesce_key`, monotonic
  `seq`, `attempts`, and `next_attempt_at` columns.
- **Alarm-driven batched flush** to `users/{userId}/binder/state/events/{YYYY/MM/DD}/{firstSeq}-{lastSeq}.json`,
  triggered by either a time threshold (~10s) or a size threshold (~50 events).
- **Coalesce-by-key** for state-update events (progress upsert, highlight
  edits, note body edits); append-only events (creates) do not coalesce.
- **Periodic snapshot compaction** under `binder/state/snapshot.json`.
- **On-demand export** under `binder/export/` producing `binder.json`,
  copied document folders, summaries, and a rebuilt `search.sqlite`.
- **Rebuild path** that loads the latest snapshot, replays events in `seq`
  order, and re-asks each `DocumentDO` for chunk text to repopulate
  `binder_chunks_fts` (contentless FTS has no stored content).

V1 design choices must not preclude this work — that is the only constraint
this section places on the rest of the PRD.

## 17. Implementation Phases

### Phase 0 - Reset and foundation

- Accept development data wipe.
- Remove or stop using D1 document-domain tables:
  - `document`
  - `shelf`
  - `shelf_document`
  - `progress`
  - `highlight`
  - `note`
  - `conversation`, if conversation metadata moves fully into BinderDO
- Keep D1 auth/profile tables.
- Add `BINDER` and `DOCUMENT` Durable Object bindings and migrations.
- Add typed accessor modules for DO stubs.

### Phase 1 - BinderDO source of truth

- Implement BinderDO migrations.
- Implement document catalog methods.
- Rewire document list/get/update routes to BinderDO. (DELETE waits for
  Phase 2 — it depends on DocumentDO and the deletion Workflow.)
- Keep R2 document asset layout unchanged.

### Phase 2 - Manifest v2 and ingest

- Update EPUB manifest writer to schema v2.
- Rewire upload/process flow:
  - R2 original write
  - BinderDO document row
  - Workflow parse/render
  - DocumentDO ingest
  - BinderDO chunk indexing
- Implement `DocumentDeletionWorkflow` and wire `DELETE /documents/:id` to
  trigger it (route → Workflow → BinderDO.removeDocument →
  DocumentDO.destroy → R2 sweep).
- Regenerate SDK after route/schema changes.

### Phase 3 - Reader and annotations

- Rewire manifest and section read endpoints.
- Move progress/highlight/note/shelf feature storage to BinderDO RPC.
- Preserve existing route-feature boundaries and zod schemas where sensible.

### Phase 4 - Search APIs

- Implement DocumentDO search.
- Implement BinderDO search.
- Add `/ai/search`, `/ai/read`, and `/ai/summarize` routes.
- Regenerate SDK.

### Phase 5 - Chat tools

- Switch ChatAgent identity to
  `idFromName(\`${userId}:${conversationId}\`)`.
- Drop `requireOwnAgentInstance`'s D1 lookup; use `BinderDO.getConversation`
  for ownership validation.
- Add `ChatAgent.init({ userId, conversationId })` and `ChatAgent.destroy()`.
- Remove `runBash` from the agent's normal toolset.
- Replace with typed BinderDO/DocumentDO tools (worker-injected `userId`,
  never model-supplied).
- Implement synchronous conversation deletion: route handler calls
  `BinderDO.removeConversation` then `ChatAgent.destroy`.
- Add tool-round and output limits.

### Phase 6 - Lazy summaries

- Implement `getOrGenerateSummary`.
- Store summary cache in DocumentDO.
- Write summary objects to R2.
- Invalidate by `contentHash`.

### Phase 7 - Query expansion

- Add `expand_query`.
- Use it only after weak lexical results.

### Phase 8 - Export and rebuild (deferred, post-v1)

Out of scope for v1. See §16 for the expected shape when this work is picked
up: outbox + alarm-driven batched flush, coalesce-by-key, monotonic `seq`,
snapshot compaction, on-demand export tree, and per-document fan-out to
repopulate the contentless FTS index.

## 18. Open Questions

1. **BinderDO growth.**
   BinderDO owns all user-authored metadata and the cross-binder index. This is
   clean, but a very large binder can approach the 10 GB per-object storage
   limit. If needed later, shard binder search into archive/index DOs while
   keeping BinderDO as the catalog root.

2. **Conversation transport.**
   The current Agents SDK path is useful. Keep it if typed tools and BinderDO
   ownership validation fit cleanly. If not, replace it with an explicit
   `/ai/chat` route.

3. **Admin/global reporting.**
   Removing D1 document tables means global SQL reporting is gone. If product
   operations need "all failed documents across all users", add a separate
   operational event stream or analytics sink. Do not reintroduce D1 as a
   second document source of truth.

4. **Highlight/note/progress alignment under reprocess.**
   When same-`documentId` reprocess is picked up (see §12 Reprocess),
   user-authored references may not survive content changes. Section keys
   may shift, offsets may move. Need a strategy: re-anchor by text match,
   invalidate and notify the user, or keep references with a "may be stale"
   flag. Out of scope until reprocess itself ships.

## 19. References

- Cloudflare Durable Objects rules:
  https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Cloudflare SQLite-backed Durable Object Storage:
  https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cloudflare Durable Object limits:
  https://developers.cloudflare.com/durable-objects/platform/limits/
- SQLite FTS5:
  https://www.sqlite.org/fts5.html
