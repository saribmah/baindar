import { useEffect, useState, type RefObject } from "react";
import { Button, IconButton, Icons, SelectionToolbar, useTheme } from "@baindar/ui";
import type { Highlight } from "@baindar/sdk";
import { useProfile } from "../profile";
import { useHighlightLayer, type HighlightColor } from "./useHighlightLayer";

const TOOLBAR_OFFSET_Y = 12;
const TOOLBAR_HEIGHT_ESTIMATE = 58;
const NOTE_POPOVER_WIDTH = 360;
const NOTE_POPOVER_GAP = 14;

export type HighlightLayerProps = {
  containerRef: RefObject<HTMLElement | null>;
  documentId: string;
  sectionKey: string | null;
  contentKey: string;
  targetHighlightId?: string | null;
  targetRequestId?: string | null;
  onAskSelection?: (payload: HighlightAskPayload) => void;
};

export type HighlightAskPayload =
  | {
      kind: "passage";
      text: string;
      position: { offsetStart: number; offsetEnd: number };
    }
  | {
      kind: "highlight";
      highlight: Highlight;
    };

export function HighlightLayer({
  containerRef,
  documentId,
  sectionKey,
  contentKey,
  targetHighlightId,
  targetRequestId,
  onAskSelection,
}: HighlightLayerProps) {
  const layer = useHighlightLayer({
    containerRef,
    documentId,
    sectionKey,
    contentKey,
    enabled: sectionKey !== null,
    targetHighlightId,
    targetRequestId,
  });
  const { profile } = useProfile();
  const defaultColor: HighlightColor = profile?.defaultHighlightColor ?? "pink";

  const [noteDraft, setNoteDraft] = useState<{
    id: string;
    quote: string;
    anchorRect?: DOMRect;
  } | null>(null);

  const handleCopySelection = () => {
    const text = layer.selection?.text;
    if (!text) return;
    void copyText(text).finally(layer.clearSelection);
  };

  const handleHighlightSelection = (color: HighlightColor = defaultColor) => {
    void layer.create(color);
  };

  const handleAskSelection = () => {
    const selection = layer.selection;
    if (!selection) return;
    onAskSelection?.({
      kind: "passage",
      text: selection.text,
      position: {
        offsetStart: selection.charRange.start,
        offsetEnd: selection.charRange.end,
      },
    });
    layer.clearSelection();
  };

  const handleAddNoteFromSelection = () => {
    const activeSelection = layer.selection;
    if (!activeSelection) return;
    void layer.create(defaultColor).then((created) => {
      if (!created) return;
      setNoteDraft({
        id: created.id,
        quote: created.textSnippet,
        anchorRect: activeSelection.rect,
      });
    });
  };

  if (sectionKey === null) return null;

  return (
    <>
      {layer.selection && !noteDraft && (
        <SelectionToolbarPositioned
          rect={layer.selection.rect}
          onCopy={handleCopySelection}
          onHighlight={handleHighlightSelection}
          onPickColor={handleHighlightSelection}
          onAsk={handleAskSelection}
          onAddNote={handleAddNoteFromSelection}
          activeColor={defaultColor}
        />
      )}

      {layer.focused && !noteDraft && (
        <HighlightPopover
          highlightId={layer.focused.id}
          containerRef={containerRef}
          color={layer.focused.color}
          note={layer.getNoteForHighlight(layer.focused.id)?.body ?? null}
          textSnippet={layer.focused.textSnippet}
          contentKey={contentKey}
          onClose={() => layer.setFocusedId(null)}
          onChangeColor={(color) => {
            void layer.updateColor(layer.focused!.id, color);
          }}
          onEditNote={() =>
            setNoteDraft({
              id: layer.focused!.id,
              quote: layer.focused!.textSnippet,
            })
          }
          onAsk={() => {
            onAskSelection?.({ kind: "highlight", highlight: layer.focused! });
            layer.setFocusedId(null);
          }}
          onCopy={() => {
            void copyText(layer.focused!.textSnippet);
          }}
          onDelete={() => {
            void layer.remove(layer.focused!.id);
          }}
        />
      )}

      {noteDraft && (
        <NotePopover
          highlightId={noteDraft.id}
          containerRef={containerRef}
          contentKey={contentKey}
          anchorRect={noteDraft.anchorRect}
          initialNote={layer.getNoteForHighlight(noteDraft.id)?.body ?? ""}
          quote={noteDraft.quote}
          onCancel={() => setNoteDraft(null)}
          onAsk={() => {
            const highlight = layer.highlights.find((item) => item.id === noteDraft.id);
            if (highlight) onAskSelection?.({ kind: "highlight", highlight });
            setNoteDraft(null);
          }}
          onSave={async (note) => {
            const trimmed = note.trim();
            await layer.setNoteForHighlight(noteDraft.id, trimmed.length > 0 ? trimmed : null);
            setNoteDraft(null);
          }}
        />
      )}
    </>
  );
}

function SelectionToolbarPositioned({
  rect,
  onCopy,
  onHighlight,
  onPickColor,
  onAsk,
  onAddNote,
  activeColor,
}: {
  rect: DOMRect;
  onCopy: () => void;
  onHighlight: () => void;
  onPickColor: (color: HighlightColor) => void;
  onAsk: () => void;
  onAddNote: () => void;
  activeColor: HighlightColor;
}) {
  // Prefer above the selection; if there's no room, fall back to below.
  const above = rect.top - TOOLBAR_OFFSET_Y - TOOLBAR_HEIGHT_ESTIMATE >= 8;
  const top = above
    ? rect.top - TOOLBAR_OFFSET_Y - TOOLBAR_HEIGHT_ESTIMATE
    : rect.bottom + TOOLBAR_OFFSET_Y;
  const left = Math.max(8, Math.min(window.innerWidth - 8, rect.left + rect.width / 2));

  return (
    <div
      style={{
        position: "fixed",
        top,
        left,
        transform: "translateX(-50%)",
        zIndex: 30,
      }}
    >
      <SelectionToolbar
        variant="actions"
        onCopy={onCopy}
        onHighlight={onHighlight}
        onPickColor={onPickColor}
        onAsk={onAsk}
        onAddNote={onAddNote}
        activeColor={activeColor}
      />
    </div>
  );
}

function HighlightPopover({
  highlightId,
  containerRef,
  color,
  note,
  textSnippet,
  contentKey,
  onClose,
  onChangeColor,
  onEditNote,
  onAsk,
  onCopy,
  onDelete,
}: {
  highlightId: string;
  containerRef: RefObject<HTMLElement | null>;
  color: HighlightColor;
  note: string | null;
  textSnippet: string;
  contentKey: string;
  onClose: () => void;
  onChangeColor: (color: HighlightColor) => void;
  onEditNote: () => void;
  onAsk: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { theme } = useTheme();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Look up the mark in the live DOM. Re-run on contentKey so a chapter
  // switch (which invalidates DOM marks) drops the popover.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setRect(null);
      return;
    }
    const mark = container.querySelector<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`);
    if (!mark) {
      setRect(null);
      onClose();
      return;
    }
    setRect(mark.getBoundingClientRect());
  }, [highlightId, containerRef, contentKey, onClose]);

  // Close on outside click and on escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-highlight-popover]")) return;
      if (t.closest(`mark[data-highlight-id="${highlightId}"]`)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [highlightId, onClose]);

  if (!rect) return null;
  const top = rect.bottom + 12;
  const left = Math.max(8, Math.min(window.innerWidth - 8, rect.left + rect.width / 2));
  const highlightColor = `var(--hl-${color})`;
  const surface =
    theme === "dark"
      ? "var(--night-800)"
      : theme === "sepia"
        ? "var(--sepia-50)"
        : "var(--paper-50)";
  const border =
    theme === "dark"
      ? "oklch(30% 0.012 240)"
      : theme === "sepia"
        ? "var(--sepia-200)"
        : "var(--paper-200)";
  const raised =
    theme === "dark"
      ? "oklch(15% 0.008 240)"
      : theme === "sepia"
        ? "var(--sepia-100)"
        : "var(--paper-100)";
  const fg = theme === "dark" ? "var(--night-50)" : "var(--paper-900)";
  const muted =
    theme === "dark"
      ? "var(--night-200)"
      : theme === "sepia"
        ? "var(--sepia-700)"
        : "var(--paper-500)";

  if (confirmDelete) {
    return (
      <div
        data-highlight-popover
        role="dialog"
        aria-label="Delete highlight"
        style={{
          position: "fixed",
          top,
          left,
          transform: "translateX(-50%)",
          zIndex: 30,
          width: "min(320px, calc(100vw - 16px))",
        }}
      >
        <div
          className="relative overflow-visible rounded-2xl border"
          style={{
            background: surface,
            borderColor: border,
            boxShadow: "0 24px 48px rgba(20,15,10,0.18), 0 4px 12px rgba(20,15,10,0.08)",
          }}
        >
          <PopoverCaret background={surface} borderColor={border} />
          <div className="flex flex-col gap-2 px-[18px] pb-2 pt-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[oklch(96%_0.040_25)]">
              <Icons.Trash size={16} color="var(--error)" />
            </div>
            <div className="font-display text-lg font-medium leading-tight text-bd-fg">
              Delete this highlight?
            </div>
            <p className="t-body-m m-0 text-[13px] leading-5 text-bd-fg-subtle">
              {note
                ? "The attached note will be deleted with it. This can't be undone."
                : "This can't be undone."}
            </p>
          </div>
          <div className="flex justify-end gap-2 px-3.5 pb-3.5 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="bg-error text-paper-50 hover:bg-error"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-highlight-popover
      role="dialog"
      aria-label="Highlight options"
      style={{
        position: "fixed",
        top,
        left,
        transform: "translateX(-50%)",
        zIndex: 30,
        width: note ? "min(380px, calc(100vw - 16px))" : "min(340px, calc(100vw - 16px))",
      }}
    >
      <div
        className="relative overflow-visible rounded-2xl border"
        style={{
          background: surface,
          borderColor: border,
          boxShadow: "0 24px 48px rgba(20,15,10,0.18), 0 4px 12px rgba(20,15,10,0.08)",
          color: fg,
        }}
      >
        <PopoverCaret background={surface} borderColor={border} />
        <div
          className="flex items-center gap-2.5 border-b px-3.5 py-3"
          style={{ borderColor: border }}
        >
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border border-black/10"
              style={{ background: highlightColor }}
            />
            {note && <Icons.Note size={11} color={muted} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="t-label-m text-bd-fg">{note ? "Highlight + note" : "Highlight"}</div>
            <div className="font-mono text-[11px]" style={{ color: muted }}>
              Selected passage
            </div>
          </div>
          <IconButton aria-label="Close" size="sm" onClick={onClose}>
            <Icons.Close size={13} />
          </IconButton>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3.5">
          <blockquote
            className="m-0 border-l-2 pl-3 font-reading text-[13px] leading-6 italic text-bd-fg-subtle"
            style={{ borderColor: highlightColor }}
          >
            "{textSnippet}"
          </blockquote>

          <SelectionToolbar
            colors={["pink", "yellow", "green", "blue", "purple"]}
            onPickColor={onChangeColor}
            aria-label={`Change color (current: ${color})`}
          />

          {note && (
            <div className="flex gap-2.5 rounded-xl px-3.5 py-3" style={{ background: raised }}>
              <Icons.Note size={14} color={muted} />
              <p className="m-0 flex-1 whitespace-pre-wrap font-reading text-sm leading-6 text-bd-fg">
                {note}
              </p>
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-1 border-t px-3 py-2.5"
          style={{ borderColor: border }}
        >
          <Button
            variant={note ? "ghost" : "secondary"}
            size="sm"
            iconStart={note ? <Icons.Pencil size={13} /> : <Icons.Note size={13} />}
            onClick={onEditNote}
          >
            {note ? "Edit note" : "Add note"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-bd-accent"
            iconStart={<Icons.Sparkles size={13} />}
            onClick={onAsk}
          >
            Ask
          </Button>
          <div className="min-w-3 flex-1" />
          <IconButton aria-label="Copy highlight" size="sm" onClick={onCopy}>
            <Icons.Copy size={15} />
          </IconButton>
          <IconButton
            aria-label="Delete highlight"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Icons.Trash size={15} color="var(--error)" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function PopoverCaret({ background, borderColor }: { background: string; borderColor: string }) {
  return (
    <span
      aria-hidden
      className="absolute left-8 top-[-6px] h-3 w-3 rotate-45 border-l border-t"
      style={{ background, borderColor }}
    />
  );
}

function NotePopover({
  highlightId,
  containerRef,
  contentKey,
  anchorRect,
  initialNote,
  quote,
  onCancel,
  onAsk,
  onSave,
}: {
  highlightId: string;
  containerRef: RefObject<HTMLElement | null>;
  contentKey: string;
  anchorRect?: DOMRect;
  initialNote: string;
  quote: string;
  onCancel: () => void;
  onAsk: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const { theme } = useTheme();
  const [rect, setRect] = useState<DOMRect | null>(anchorRect ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onDoc = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-note-popover]")) return;
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onCancel]);

  useEffect(() => {
    const container = containerRef.current;
    const mark = container?.querySelector<HTMLElement>(`mark[data-highlight-id="${highlightId}"]`);
    if (mark) setRect(mark.getBoundingClientRect());
  }, [highlightId, containerRef, contentKey]);

  const inputBg =
    theme === "dark"
      ? "bg-[oklch(15%_0.008_240)] text-night-50 border-[oklch(28%_0.012_240)]"
      : theme === "sepia"
        ? "bg-sepia-50 text-sepia-900 border-sepia-200"
        : "bg-bd-bg text-bd-fg border-bd-border";

  const surface =
    theme === "dark"
      ? "var(--night-800)"
      : theme === "sepia"
        ? "var(--sepia-50)"
        : "var(--paper-50)";
  const border =
    theme === "dark"
      ? "oklch(30% 0.012 240)"
      : theme === "sepia"
        ? "var(--sepia-200)"
        : "var(--paper-200)";
  const muted =
    theme === "dark"
      ? "var(--night-200)"
      : theme === "sepia"
        ? "var(--sepia-700)"
        : "var(--paper-500)";
  const fg = theme === "dark" ? "var(--night-50)" : "var(--paper-900)";
  const raised =
    theme === "dark"
      ? "oklch(15% 0.008 240)"
      : theme === "sepia"
        ? "var(--sepia-100)"
        : "var(--paper-100)";
  const position = rect ? notePopoverPosition(rect) : null;

  if (!position) return null;

  return (
    <div
      data-note-popover
      role="dialog"
      aria-label="Edit note"
      className="fixed z-30"
      style={{
        top: position.top,
        left: position.left,
        transform: position.transform,
        width: "min(360px, calc(100vw - 16px))",
      }}
    >
      <div
        className="flex flex-col gap-3 rounded-[18px] border p-5"
        style={{
          background: surface,
          borderColor: border,
          boxShadow: "0 24px 48px rgba(20,15,10,0.20), 0 4px 12px rgba(20,15,10,0.10)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-black/10"
            style={{ background: "var(--hl-pink)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="t-label-m" style={{ color: fg }}>
              Note on highlight
            </div>
            <div className="font-mono text-[11px]" style={{ color: muted }}>
              Selected passage
            </div>
          </div>
          <IconButton aria-label="Close" size="sm" onClick={onCancel}>
            <Icons.Close size={12} />
          </IconButton>
        </div>

        <blockquote
          className="m-0 border-l-2 pl-3 font-reading text-[13px] leading-normal italic"
          style={{ borderColor: "var(--hl-pink)", color: "var(--bd-fg-subtle)" }}
        >
          "{quote}"
        </blockquote>

        <textarea
          autoFocus
          className={`t-body-m min-h-20 w-full resize-none rounded-[12px] border px-3 py-2 font-reading leading-relaxed outline-none ${inputBg}`}
          placeholder="What did you think?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        <button
          type="button"
          className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-left"
          style={{ background: raised, color: "var(--bd-accent)" }}
          onClick={onAsk}
        >
          <Icons.Sparkles size={13} />
          <span className="t-body-s font-semibold">Ask Baindar about this passage instead</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="t-body-s text-[11px]" style={{ color: muted }}>
            On highlight
          </span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(value);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function notePopoverPosition(rect: DOMRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(NOTE_POPOVER_WIDTH, viewportWidth - 16);
  const top = Math.max(8, Math.min(rect.top - 20, viewportHeight - 280));

  if (rect.right + NOTE_POPOVER_GAP + width <= viewportWidth - 8) {
    return { top, left: rect.right + NOTE_POPOVER_GAP, transform: "none" };
  }

  if (rect.left - NOTE_POPOVER_GAP - width >= 8) {
    return { top, left: rect.left - NOTE_POPOVER_GAP - width, transform: "none" };
  }

  const centeredLeft = Math.max(
    width / 2 + 8,
    Math.min(viewportWidth - width / 2 - 8, rect.left + rect.width / 2),
  );
  return {
    top: Math.max(8, Math.min(rect.bottom + NOTE_POPOVER_GAP, viewportHeight - 280)),
    left: centeredLeft,
    transform: "translateX(-50%)",
  };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path for restricted browser contexts.
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
