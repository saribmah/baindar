# Baindar AI Layer — Implementation Deviations

Reference log of choices made during implementation that diverge from
[`.agents/ai-layer-prd.md`](./ai-layer-prd.md) or
[`~/.claude/plans/rosy-sprouting-penguin.md`](~/.claude/plans/rosy-sprouting-penguin.md).
Each entry: what the canonical doc said, what we shipped, why, and whether
something still needs to be revisited.

Phases below match the plan's phase numbering. Phase numbers refer to
the staging in the plan, not git tags.

---

## Phase 0 — Reset and foundation

### D0-1. DO accessor location: feature-local with declaration merging (initial)

- **Plan:** Place accessors at `packages/api/src/durable/binder.ts` and
  `packages/api/src/durable/document.ts`.
- **Shipped (Phase 0):** Merged the accessor namespace into the DO class file
  itself (`binder/binder-do.ts`, `document/document-do.ts`) using TypeScript
  class+namespace declaration merging, mirroring the existing
  `agent/agent.ts` accessor convention.
- **Why:** Existing convention is feature-local (`agent/agent.ts` is the
  ChatAgent accessor). A parallel `src/durable/` tree wasn't needed.
- **Status:** Superseded in Phase 1 — see D1-3 (split into separate
  `binder/binder.ts` accessor file because storage tests pulled
  `cloudflare:workers` into bun's import graph).

### D0-2. DELETE_DOCUMENT workflow binding deferred to Phase 2

- **Plan:** "Add a `DELETE_DOCUMENT` workflows binding (Phase 2 will
  implement; binding can land now to keep wrangler edits in one batch)."
- **Shipped:** Did **not** add the binding in Phase 0; landed it in Phase 2
  alongside the `DocumentDeletionWorkflow` class implementation.
- **Why:** Adding the binding before the class exists would have failed
  wrangler typegen / dev boot — `class_name` would point at nothing.
- **Status:** Resolved in Phase 2.

### D0-3. D1 drop migration deferred (originally Phase 0 → now Phase 3)

- **Plan / PRD:** Phase 0 was to ship `0005_drop_document_domain.sql`
  dropping `document`, `shelf`, `shelf_document`, `progress`, `highlight`,
  `note`. PRD §17 Phase 0 says "Remove or stop using D1 document-domain
  tables".
- **Shipped:** No drop migration yet. D1 tables remain populated via
  dual-write (see D1-1).
- **Why:** Sibling tables (highlight, note, progress, shelf_document,
  conversation) all have `FOREIGN KEY ... REFERENCES document(id)` with
  `ON DELETE CASCADE`. The test harness sets `PRAGMA foreign_keys=ON`
  (`packages/api/src/document/__tests__/test-db.ts:28`), so dropping
  `document` while siblings still write to D1 would FK-fail on every
  insert. Production (Cloudflare D1) doesn't enforce FKs, but the
  test harness does.
- **Status:** Closed in Phase 3 — `0005_optimal_sister_grimm.sql` drops
  all six document-domain tables. See D3-3.

---

## Phase 1 — BinderDO source of truth

### D1-1. Dual-write D1 catalog through Phases 1–2

- **Plan / PRD:** "BinderDO source of truth for the catalog. List/get/update
  routes are rewired."
- **Shipped:** BinderDO is the **read** source of truth, but
  `DocumentStorage.create / updateTitle / markProcessed / markFailed /
  remove` dual-write to BinderDO **and** D1. All paths tagged `DUAL-WRITE`
  in `packages/api/src/document/storage.ts`. `DocumentStorage.getInternal`
  reads D1 directly (workflow-only path).
- **Why:**
  1. FK-enforcing test harness (D0-3) needs the D1 row to satisfy sibling
     INSERTs.
  2. The format Workflow's `loadDocument` step receives only `documentId`
     and reverse-looks up `userId` from D1. Threading `userId` through
     Workflow params requires Phase 2 work.
- **Status:** Closed in Phase 3. Sibling features moved to BinderDO RPCs
  (D3-3), document-domain D1 tables dropped (`0005`), `DUAL-WRITE` /
  `getInternal` paths removed from `DocumentStorage`, and
  `EpubWorkflowParams` now carries `userId` so workflow steps no longer
  need a D1 reverse lookup (D3-2).

### D1-2. DELETE /documents/:id stayed live in Phase 1

- **Plan:** "DELETE waits for Phase 2 — it depends on DocumentDO and the
  deletion Workflow." Plan said route should `501` until Phase 2.
- **Shipped:** DELETE kept working synchronously through Phase 1.
- **Why:** The synchronous `Document.remove` path was still correct in
  Phase 1 (Binder cascades + D1 FK cascade handle child tables). Returning
  501 would have been a regression for no benefit.
- **Status:** Resolved in Phase 2 — the route now triggers
  `DocumentDeletionWorkflow` and returns 202.

### D1-3. BinderDO split: thin DO wrapper + pure SQL store + separate accessor file

- **Plan:** "Empty `class extends DurableObject<Env>` with a
  `_sql_schema_migrations` table and the migration runner."
- **Shipped:**
  - `packages/api/src/binder/binder-store.ts` — pure SQL implementation,
    no `cloudflare:workers` import.
  - `packages/api/src/binder/binder-do.ts` — thin DO wrapper that
    constructs `BinderStore(this.ctx.storage.sql)`.
  - `packages/api/src/binder/binder.ts` — `Binder.require(userId)`
    accessor with type-only DO import; consumers use `Binder.require`,
    not `BinderDO.require`.
- **Why:** Storage modules import the accessor at runtime. Without the
  type-only split, every test that imports `DocumentStorage`
  transitively pulls in `cloudflare:workers`, which only resolves inside
  the Worker runtime. Mirrors the existing
  `formats/epub/{workflow,steps}.ts` split.
- **Status:** Closed. Same pattern repeated in Phase 2 for DocumentDO
  (`document-store.ts` + `document-do.ts` + `document-binding.ts`).

---

## Phase 2 — Manifest v2, ingest, deletion

### D2-1. External-content FTS5 instead of contentless

- **PRD §9:**
  ```sql
  CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
    document_title, section_title, text,
    content='',  -- contentless
    tokenize='porter unicode61 remove_diacritics 2'
  );
  ```
  Plus prose: "When a document title changes, BinderDO updates
  `binder_chunk_refs.document_title` and rebuilds affected FTS rows by
  `DELETE`+`INSERT`".
- **Shipped:**
  ```sql
  -- binder_chunk_refs gains a `text TEXT NOT NULL` column.
  CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
    document_title, section_title, text,
    content='binder_chunk_refs',
    content_rowid='rowid',
    tokenize='porter unicode61 remove_diacritics 2'
  );
  -- Plus standard FTS5 sync triggers (AI / AD / AU) on binder_chunk_refs.
  ```
- **Why:** SQLite contentless FTS5's DELETE command requires re-supplying
  every original column value (per FTS5 docs §4.4.3). For
  `removeDocument`, that would force BinderDO to round-trip back to
  DocumentDO to fetch chunk text just to delete an FTS row — unworkable
  on every cleanup. External-content mode lets standard SQL UPSERT/DELETE
  drive the index via triggers.
- **Trade-off:** `binder_chunk_refs.text` stores chunk text once in
  BinderDO (in addition to the per-DocumentDO copy). Increases BinderDO
  size — relevant to PRD §18 open question 1 ("BinderDO growth").
- **Status:** Open as a future optimization. Pure contentless can be
  revisited if a binder pushes BinderDO toward the 10 GB ceiling.

### D2-2. Deletion split: `deletion-steps.ts` + `deletion-workflow.ts`

- **Plan:** Single `packages/api/src/document/processing/deletion-workflow.ts`.
- **Shipped:**
  - `deletion-steps.ts` — pure step bodies + `runDeletionInline` + the
    `DocumentDeletion.trigger` namespace. No `cloudflare:workers` dep.
  - `deletion-workflow.ts` — just the `WorkflowEntrypoint` class.
- **Why:** Mirrors the EPUB `steps.ts` / `workflow.ts` split so tests can
  invoke step bodies inline (via the fake DELETE_DOCUMENT binding) without
  pulling `cloudflare:workers` into bun's import graph.
- **Status:** Closed.

### D2-3. removeBinderRow dual-deletes D1 catalog

- **Plan:** "BinderDO.removeDocument" only.
- **Shipped:** Step body calls `DocumentStorage.remove(documentId, userId)`
  which dual-deletes BinderDO + D1.
- **Why:** Same FK / dual-write rationale as D1-1 — D1 catalog row must
  go away when BinderDO row does, otherwise FK constraints in the test
  harness break sibling-table cleanup.
- **Status:** Closed in Phase 3. With D1 catalog gone, `DocumentStorage.remove`
  no longer dual-deletes — `BinderStore.removeDocument` is the only path
  and runs all sibling cleanup inside one BinderDO transaction.

### D2-4. DELETE /documents/:id status: 202 (vs plan's 204)

- **Plan / current code:** Pre-Phase-2 returned 204 (synchronous delete).
- **Shipped:** 202 Accepted, with description noting async cleanup.
  Catalog row vanishes in <1s (BinderDO single-transaction step); R2
  sweep + DocumentDO destroy run async via Workflow.
- **Why:** Workflow-driven delete is asynchronous-by-design.
- **Status:** Closed. SDK regen propagates the new response code.

### D2-5. Manifest v2 — schemaVersion bump is breaking

- **PRD §8:** New schema (v2) with documentId, userId, processor,
  createdAt, updatedAt, contentHash, source, content, ai sub-objects.
- **Shipped:** `Document.Manifest.schemaVersion: 2`. Old v1 manifests
  fail zod validation.
- **Why:** PRD §4 says "development data can be wiped". No back-compat
  path needed.
- **Status:** Closed. Reader UI consumes the new shape via the
  regenerated SDK.

---

## Cross-phase patterns to remember

- **DO file organization** (consistent across BinderDO + DocumentDO):
  - `<thing>-store.ts` — pure SQL, no `cloudflare:workers`, bun-testable.
  - `<thing>-do.ts` — thin `DurableObject` wrapper.
  - `<thing>.ts` (or `<thing>-binding.ts` for DocumentDO) — accessor with
    type-only DO import. Storage / feature modules import the accessor.
- **Workflow file organization** (EPUB + Deletion both follow):
  - `<thing>-steps.ts` — pure step bodies, no `cloudflare:workers`,
    bun-testable. Includes the inline runner used by test fakes.
  - `<thing>-workflow.ts` — `WorkflowEntrypoint` class.
- **Test fake naming and place**: every binding the worker reads from
  needs a `createFake<Binding>Binding` in
  `packages/api/src/document/__tests__/test-db.ts`. As of Phase 2 we
  have: BUCKET, EPUB_PROCESSOR, DELETE_DOCUMENT, ChatAgent, BINDER,
  DOCUMENT.

---

## Phase 3 — sibling features to BinderDO + drop D1 document-domain

### D3-1. Conversation table stays in D1 (does not move to BinderDO)

- **PRD §9 / §17:** PRD lists "conversation metadata" inside BinderDO and
  the BinderDO migration creates a `conversations` table.
- **Shipped (through Phase 4):** Conversation rows lived in D1
  (`conversation` table). BinderDO's `conversations` table existed but was
  unused. Document-delete cascade was emulated via an explicit
  `DELETE FROM conversation WHERE primary_doc_id = ?` in
  `DocumentStorage.remove`.
- **Why deferred:** `ConversationStorage.ownerOf(conversationId)` was a
  global reverse lookup the ChatAgent DO needed when its only handle was
  the conversationId.
- **Status:** Closed in Phase 5. ChatAgent identity flipped to
  `idFromName(\`${userId}:${conversationId}\`)` and persists the pair to
  DO storage in `init()`, so the owner reverse-lookup is gone. Conversation
  RPCs (`createConversation` / `getConversation` / `listConversations` /
  `updateConversation` / `touchConversation` / `removeConversation`) now
  live on BinderDO; migration `0006_talented_khan.sql` drops the D1
  `conversation` table; `DocumentStorage.remove` no longer touches
  conversations directly — `BinderStore.removeDocument` nulls
  `primary_document_id` inside the same transaction.

### D3-2. EpubWorkflowParams now carries userId (resolves D1-1 follow-up)

- **Plan / D1-1 follow-up:** "decide whether `EpubWorkflowParams` should
  carry `userId` so `loadDocument` doesn't need a D1 reverse lookup."
- **Shipped:** `EpubWorkflowParams = { userId, documentId }`.
  `Processor.trigger` takes the full params object;
  `Document.create` passes both. `loadDocument` reads from BinderDO via
  `Binder.require(userId).getDocument(documentId)` — no D1 reverse lookup.
  Same change applies to `markProcessed`, `markFailed`, `recordFailure`,
  and the inline test runner. `DocumentStorage.getInternal` is removed.
- **Why:** D1 document table is gone (D3-3). userId must flow from the
  trigger site into every step body. Plumbing it through params keeps each
  step body pure (no global reverse lookup) and matches how the deletion
  workflow already worked.
- **Status:** Closed.

### D3-3. D1 document-domain tables dropped (resolves D0-3 / D1-1 / D2-3)

- **Plan / PRD §17 Phase 0–3:** Drop `document`, `shelf`, `shelf_document`,
  `progress`, `highlight`, `note`.
- **Shipped (migration 0005_optimal_sister_grimm.sql):** Drops all six
  tables plus rebuilds `conversation` without its FK to `document`. Order
  matters under `PRAGMA foreign_keys=ON` in the test harness — drops are
  ordered child-before-parent (`note → highlight → progress →
  shelf_document → shelf → document`) inside an explicit
  `PRAGMA foreign_keys=OFF / ON` block. Drizzle's auto-generated migration
  was edited by hand to add the OFF/ON wrap because drizzle-kit emits
  drops in alphabetical order.
- **Sibling storage modules** (`progress/storage.ts`, `highlight/storage.ts`,
  `note/storage.ts`, `shelf/storage.ts`) all rewritten to delegate to
  BinderDO. Schema files for the dropped tables are deleted; only `auth`,
  `conversation`, and `profile` remain in `db/schema/*`.
- **DocumentStorage** simplified: no `entitySelect`, `EntityRow`,
  `toEntity`, `getInternal`, or DUAL-WRITE paths. All reads/writes go
  through Binder.
- **Why:** Phase 0–2 dual-write was a workaround for FK-enforcing tests
  and the Workflow's reverse lookup. Both reasons are gone, so the D1
  catalog tables are dead weight.
- **Status:** Closed.

### D3-4. Position payloads use `Record<string, number>` over RPC

- **Background:** BinderDO RPCs originally typed `position` as `unknown`
  (`ProgressRow.position`, `HighlightRow.position`). Cloudflare's
  `DurableObjectStub<BinderDO>` typing flattens `unknown` to `never`
  through the RPC boundary, which broke ts-check on storage callers
  (`src/document/storage.ts`, `src/highlight/storage.ts`).
- **Shipped:** Concrete shared type
  `PositionPayload = Record<string, number>` in `binder-store.ts`.
  Callers narrow to format-specific types (`Progress.Position`,
  `Highlight.Position`) via small `toPosition` helpers in their storage
  modules (no `as unknown as` casts).
- **Why:** Cloudflare RPC needs a concrete, structurally-typed shape for
  ts-check to flow types across the stub boundary. `Record<string, number>`
  covers every position payload we have today (`{offset}` for progress,
  `{offsetStart, offsetEnd}` for highlights) without leaking format
  details into BinderDO.
- **Status:** Open. Add a discriminated union if a future format needs
  non-numeric position fields.

---

## Phase 4 — Search APIs

### D4-1. FTS5 query helpers live in `document-store.ts`, imported by `binder-store.ts`

- **Plan:** Each store gets its own `search()`. No prescription on where the
  raw-text → FTS5-MATCH compiler lives.
- **Shipped:** `compileFtsQuery`, `compileFtsOrQuery`, and `tokenizeQuery`
  are exported from `document-store.ts` and imported by `binder-store.ts`.
  Both stores share the same compiler, so the BinderDO and DocumentDO
  queries tokenize identically (matters for the snippet fan-out — terms
  passed back into `DocumentDO.getChunkSnippet` must match the binder's
  tokenization).
- **Why:** Avoids duplicating the regex/dedupe logic. Putting it in
  `document-store.ts` keeps it co-located with the chunk-text owner; the
  store has no `cloudflare:workers` dependency, so importing it from
  `binder-store.ts` doesn't break the bun-test build.
- **Status:** Closed. If a third FTS site appears, lift to
  `src/utils/fts.ts`.

### D4-2. BinderDO.search returns refs + terms (snippet fan-out renders text)

- **PRD §9 / §14:** "BinderDO.search returns ranked chunk references
  (document_id, section_key, chunk_index, score, matched terms). The worker
  fans out to DocumentDO.getChunkSnippet for the top-N hits to produce
  user-facing snippets."
- **Shipped:** `BinderStore.search` returns `BinderSearchHit` with
  `(documentId, documentTitle, kind, sectionKey, sectionTitle,
  chunkIndex, score, terms)`. `terms` is the tokenised user query, threaded
  through `fanOutSnippets` into `DocumentDO.getChunkSnippet({ terms })`
  which runs `snippet(chunks_fts, ...)` against the matched FTS row.
- **Why:** Even though our BinderDO is external-content (D2-1) and *could*
  render snippets directly, the PRD design assumes contentless: snippets
  always come from DocumentDO. Following the PRD shape keeps the future
  contentless option open and concentrates snippet rendering in one place.
- **Status:** Closed.

### D4-3. `getChunkSnippet` accepts optional `terms`; falls back to plain text

- **PRD §10:** Spec says `terms: string[]` is required.
- **Shipped:** `terms?: string[]` is optional. Without terms, the call
  returns the chunk's full text. With terms, FTS5 `snippet()` runs against
  the (sectionKey, chunkIndex) row and renders `<mark>` markers. If the
  chunk doesn't match the supplied terms, falls back to plain text rather
  than null.
- **Why:** Two callers want different things — the snippet fan-out needs
  highlighted snippets keyed off the binder's matched terms, but Phase 5
  tools (`read_section`-style flows) want the same RPC to read a single
  chunk verbatim. Optional `terms` covers both without a second method.
- **Status:** Closed.

### D4-4. Position payloads are now `Record<string, number>`; tightened from D3-4

- **Background:** D3-4 introduced `PositionPayload = Record<string, number>`
  to satisfy Cloudflare RPC type inference.
- **Shipped (Phase 4 follow-up):** No change here — same constraint still
  applies, and Phase 4 didn't relax it. Logged so future maintainers don't
  reopen the casting question.
- **Status:** Open as previously logged.

### D4-5. Ai feature module owns search dispatch (binder vs document scoped)

- **PRD §13/14:** PRD lists `/ai/search`, `/ai/read`, `/ai/summarize` and
  separate AI tools (`search_document`, `search_binder`). It doesn't say
  whether the route surface is one endpoint or two.
- **Shipped:** Single `POST /ai/search` route. Body's `documentId` field
  selects the path: when set, routes to `DocumentDO.search` (in-document);
  when omitted, routes to `BinderDO.search` + fan-out.
  `Ai.search/Ai.read/Ai.summarize` live in `packages/api/src/ai/ai.ts`.
- **Why:** Two PRD AI tools, one HTTP endpoint — keeps the
  request/response types unified for SDK consumers. Phase 5's chat tools
  will dispatch to the typed feature functions (`Ai.search`/`Ai.read`)
  rather than hitting the HTTP route, but both pivot off the same
  `Ai.SearchInput` shape.
- **Status:** Closed.

### D4-6. `/ai/summarize` returns 501 via `Ai.NotImplementedError`

- **Plan:** "summarize is a stub returning 501 until Phase 6."
- **Shipped:** Implemented as a typed `NamedError` (`AiNotImplementedError`)
  thrown from `Ai.summarize`, mapped to 501 by `createErrorMapper`. Added
  `501` to `HttpErrorStatus` in `server/error-mapper.ts`.
- **Why:** Keeps the route shape ready for Phase 6 — when the stub is
  replaced with a real implementation, the route handler doesn't change,
  only `Ai.summarize`.
- **Status:** Closed (re-evaluates in Phase 6).

---

## Open follow-ups (parking lot for Phase 6+)

- D2-1: re-evaluate contentless vs external-content FTS5 once binder
  size data exists.
- D3-4: switch `PositionPayload` to a discriminated union if a format
  needs non-numeric position fields.
