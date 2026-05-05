import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { Highlight, Note } from "@baindar/sdk";
import { useSdk } from "../../sdk";
import { useReaderHighlights } from "./highlightsRefresh";
import {
  charOffsetsToRange,
  rangeToCharOffsets,
  unwrapMarks,
  wrapRangeWithMarks,
  type CharRange,
} from "./textOffsets";

export type HighlightColor = Highlight["color"];

export type ActiveSelection = {
  rect: DOMRect;
  charRange: CharRange;
  text: string;
};

const HIGHLIGHT_MARK_SELECTOR = "mark[data-highlight-id]";
const MAX_SNIPPET = 4_000;

const colorClass = (color: HighlightColor): string =>
  color === "pink" ? "bd-highlight" : `bd-highlight bd-highlight-${color}`;

// Wraps stored highlights, listens for user selection inside `containerRef`,
// and exposes CRUD that persists via `client.highlight.*` and `client.note.*`.
//
// Highlights and notes live in separate stores: a highlight is the colour
// overlay, a note is free-form text optionally pinned to a highlight via
// `highlightId`. The layer keeps them aligned in a single map keyed by
// highlight id so the popover and the "has-note" indicator can render in
// one shot.
//
// `contentKey` should change whenever the body's inner HTML/text is replaced
// (chapter switch). The wrap effect re-runs and re-applies marks for the
// new content.
export function useHighlightLayer({
  containerRef,
  documentId,
  sectionKey,
  contentKey,
  enabled,
  targetHighlightId,
  targetRequestId,
}: {
  containerRef: RefObject<HTMLElement | null>;
  documentId: string;
  sectionKey: string | null;
  contentKey: string;
  enabled: boolean;
  targetHighlightId?: string | null;
  targetRequestId?: string | null;
}) {
  const { client } = useSdk();
  const refresh = useReaderHighlights();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notesByHighlightId, setNotesByHighlightId] = useState<Map<string, Note>>(new Map());
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // ---- Fetch on chapter change --------------------------------------------
  // `targetRequestId` is included so that an in-reader nav (rail/sheet click)
  // refetches the section's highlights/notes — without this, a same-chapter
  // jump leaves us with stale data and can leave the DOM unwrapped.
  useEffect(() => {
    if (!enabled || sectionKey === null) {
      setHighlights([]);
      setNotesByHighlightId(new Map());
      return;
    }
    let cancelled = false;
    Promise.all([
      client.highlight.list({ documentId, sectionKey }),
      // Notes attached to a highlight mirror the highlight's sectionKey, so
      // a section-scoped read picks them up alongside section-pinned notes.
      // We only care about the highlight-attached ones for the layer map.
      client.note.list({ documentId, sectionKey }),
    ])
      .then(([hl, notes]) => {
        if (cancelled) return;
        setHighlights(hl.data?.items ?? []);
        const map = new Map<string, Note>();
        for (const n of notes.data?.items ?? []) {
          if (n.highlightId !== null) map.set(n.highlightId, n);
        }
        setNotesByHighlightId(map);
      })
      .catch(() => {
        if (cancelled) return;
        setHighlights([]);
        setNotesByHighlightId(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, sectionKey, enabled, targetRequestId]);

  // ---- Selection tracking --------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      const sel = window.getSelection();
      const container = containerRef.current;
      if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Both ends must live inside the body container, otherwise the offsets
      // wouldn't be meaningful against the section's canonical text.
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
        setSelection(null);
        return;
      }
      // Ignore selections that begin or end inside an existing highlight —
      // those are clicks/double-clicks on the mark, handled separately.
      const startEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      if (startEl?.closest(HIGHLIGHT_MARK_SELECTOR)) {
        setSelection(null);
        return;
      }

      const text = range.toString();
      if (!text.trim()) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const charRange = rangeToCharOffsets(container, range);
      setSelection({ rect, charRange, text: text.slice(0, MAX_SNIPPET) });
    };

    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [containerRef, enabled]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  // ---- Apply marks to the rendered body ------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    unwrapMarks(container, HIGHLIGHT_MARK_SELECTOR);
    if (!enabled || highlights.length === 0) return;

    // Sort by (start, -length) so longer ranges wrap first; otherwise a
    // shorter inner highlight could split the longer one's text node and
    // confuse the next pass. Wrapping in offset order is robust because
    // each pass operates on the freshly-normalised tree.
    const ordered = [...highlights].sort((a, b) => {
      if (a.position.offsetStart !== b.position.offsetStart) {
        return a.position.offsetStart - b.position.offsetStart;
      }
      return (
        b.position.offsetEnd -
        b.position.offsetStart -
        (a.position.offsetEnd - a.position.offsetStart)
      );
    });

    for (const h of ordered) {
      const range = charOffsetsToRange(container, h.position.offsetStart, h.position.offsetEnd);
      if (!range) continue;
      const marks = wrapRangeWithMarks(range, {
        className: colorClass(h.color),
        attributes: {
          "data-highlight-id": h.id,
        },
      });
      if (notesByHighlightId.has(h.id)) {
        marks[marks.length - 1]?.setAttribute("data-highlight-has-note", "true");
      }
    }
  }, [highlights, notesByHighlightId, contentKey, containerRef, enabled]);

  useEffect(() => {
    if (!enabled || !targetHighlightId) return;
    const container = containerRef.current;
    const mark = container?.querySelector<HTMLElement>(
      `mark[data-highlight-id="${targetHighlightId}"]`,
    );
    if (!mark) return;
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
    setFocusedId(targetHighlightId);
  }, [containerRef, contentKey, enabled, highlights, targetHighlightId, targetRequestId]);

  // ---- Click delegation for opening an existing highlight ------------------
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const mark = target.closest<HTMLElement>(HIGHLIGHT_MARK_SELECTOR);
      if (!mark) return;
      const id = mark.dataset.highlightId;
      if (id) setFocusedId(id);
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [containerRef, enabled, contentKey]);

  // ---- CRUD ----------------------------------------------------------------
  const create = useCallback(
    async (color: HighlightColor, noteBody?: string) => {
      if (sectionKey === null || !selection) return null;
      const res = await client.highlight.create({
        documentId,
        sectionKey,
        position: {
          offsetStart: selection.charRange.start,
          offsetEnd: selection.charRange.end,
        },
        textSnippet: selection.text,
        color,
      });
      if (res.data) {
        const created = res.data;
        setHighlights((prev) => [...prev, created]);
        if (noteBody !== undefined && noteBody.length > 0) {
          const noteRes = await client.note.create({
            documentId,
            highlightId: created.id,
            body: noteBody,
          });
          if (noteRes.data) {
            const note = noteRes.data;
            setNotesByHighlightId((prev) => {
              const next = new Map(prev);
              next.set(created.id, note);
              return next;
            });
          }
          setFocusedId(created.id);
        }
        refresh?.bumpRefresh();
        clearSelection();
        return created;
      }
      clearSelection();
      return null;
    },
    [client, documentId, sectionKey, selection, clearSelection, refresh],
  );

  const updateColor = useCallback(
    async (id: string, color: HighlightColor) => {
      const res = await client.highlight.update({ id, color });
      if (res.data) {
        const updated = res.data;
        setHighlights((prev) => prev.map((h) => (h.id === id ? updated : h)));
        refresh?.bumpRefresh();
      }
    },
    [client, refresh],
  );

  // Single entry point for all three note paths against a highlight: create
  // when there's no existing note, update when the body is non-empty, delete
  // when the body is empty/null.
  const setNoteForHighlight = useCallback(
    async (highlightId: string, body: string | null) => {
      const existing = notesByHighlightId.get(highlightId);
      const trimmed = body?.trim() ?? "";

      if (!existing && trimmed.length > 0) {
        const res = await client.note.create({
          documentId,
          highlightId,
          body: trimmed,
        });
        if (res.data) {
          const note = res.data;
          setNotesByHighlightId((prev) => {
            const next = new Map(prev);
            next.set(highlightId, note);
            return next;
          });
          refresh?.bumpRefresh();
        }
        return;
      }

      if (existing && trimmed.length > 0) {
        const res = await client.note.update({ id: existing.id, body: trimmed });
        if (res.data) {
          const note = res.data;
          setNotesByHighlightId((prev) => {
            const next = new Map(prev);
            next.set(highlightId, note);
            return next;
          });
          refresh?.bumpRefresh();
        }
        return;
      }

      if (existing && trimmed.length === 0) {
        await client.note.delete({ id: existing.id });
        setNotesByHighlightId((prev) => {
          const next = new Map(prev);
          next.delete(highlightId);
          return next;
        });
        refresh?.bumpRefresh();
      }
    },
    [client, documentId, notesByHighlightId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      // The note FK cascades on the server; mirror that in local state so the
      // UI doesn't briefly show an orphaned note.
      await client.highlight.delete({ id });
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      setNotesByHighlightId((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setFocusedId((curr) => (curr === id ? null : curr));
      refresh?.bumpRefresh();
    },
    [client, refresh],
  );

  const focused = useMemo(
    () => highlights.find((h) => h.id === focusedId) ?? null,
    [highlights, focusedId],
  );

  const getNoteForHighlight = useCallback(
    (highlightId: string): Note | undefined => notesByHighlightId.get(highlightId),
    [notesByHighlightId],
  );

  return {
    highlights,
    selection,
    clearSelection,
    create,
    updateColor,
    setNoteForHighlight,
    remove,
    focused,
    setFocusedId,
    getNoteForHighlight,
  };
}
