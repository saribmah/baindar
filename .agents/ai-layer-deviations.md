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

### D2-1. External-content FTS5 instead of contentless — RESOLVED

- **PRD §9:** contentless FTS5 (`content=''`) for cross-binder search to
  cap BinderDO size for power users.
- **Initial deviation:** shipped external-content FTS5 with a
  `binder_chunk_refs.text TEXT NOT NULL` column, citing FTS5 §4.4.3:
  contentless DELETE requires re-supplying every original column value,
  which would force a DocumentDO round-trip on every chunk removal.
- **Resolution:** SQLite 3.43.0 (Aug 2023) introduced the
  `contentless_delete=1` option, which lets contentless FTS5 tables accept
  normal SQL DELETE statements without re-supplying column values. Workerd
  ships SQLite well past 3.43, so the original blocker no longer applies.
- **Shipped (current):**
  ```sql
  CREATE VIRTUAL TABLE binder_chunks_fts USING fts5(
    section_title, text,
    content='',
    contentless_delete=1,
    tokenize='porter unicode61 remove_diacritics 2'
  );
  ```
  - `binder_chunk_refs.text` column dropped.
  - `document_title` deliberately NOT indexed in `binder_chunks_fts`. It
    is still denormalised on `binder_chunk_refs.document_title` so search
    results display the renamed title via the JOIN, but title-token
    matches at the chunk level are out of scope. This keeps document
    rename O(1) (no FTS rebuild, no DocumentDO round-trip). If we later
    want title-token search, the right layer is a tiny per-document
    title FTS, not the chunk FTS.
  - AI/AU triggers removed (binder_chunk_refs no longer carries text).
  - Single AD trigger keeps FTS rows in sync on FK CASCADE / explicit
    DELETE: `DELETE FROM binder_chunks_fts WHERE rowid = old.rowid`.
  - `BinderSearchStore.indexDocumentChunks` writes FTS rows explicitly,
    passing chunk text in transiently for tokenization.
- **Status:** Closed.

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

- D3-4: switch `PositionPayload` to a discriminated union if a format
  needs non-numeric position fields.
