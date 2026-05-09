# Baindar AI Layer — Implementation Deviations

Reference log of choices made during implementation that diverge from
[`.agents/ai-layer-prd.md`](./ai-layer-prd.md) or
[`~/.claude/plans/rosy-sprouting-penguin.md`](~/.claude/plans/rosy-sprouting-penguin.md).
Each entry: what the canonical doc said, what we shipped, why, and whether
something still needs to be revisited.

Phases below match the plan's phase numbering. Phase numbers refer to
the staging in the plan, not git tags.

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

## Phase 3 — sibling features to BinderDO + drop D1 document-domain

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

### D4-4. Position payloads are now `Record<string, number>`; tightened from D3-4

- **Background:** D3-4 introduced `PositionPayload = Record<string, number>`
  to satisfy Cloudflare RPC type inference.
- **Shipped (Phase 4 follow-up):** No change here — same constraint still
  applies, and Phase 4 didn't relax it. Logged so future maintainers don't
  reopen the casting question.
- **Status:** Open as previously logged.

---

## Open follow-ups (parking lot for Phase 6+)

- D2-1: re-evaluate contentless vs external-content FTS5 once binder
  size data exists.
- D3-4: switch `PositionPayload` to a discriminated union if a format
  needs non-numeric position fields.
