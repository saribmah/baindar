import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Icons, Sheet, useTheme } from "@baindar/ui";
import type { DocumentSectionSummary, Highlight, Note } from "@baindar/sdk";
import { useSdk } from "../../sdk";

export type NotesSheetProps = {
  documentId: string;
  sections?: ReadonlyArray<DocumentSectionSummary>;
  currentOrder?: number;
  refreshToken: number;
  onJumpToTarget?: (order: number, highlightId?: string | null, noteId?: string | null) => void;
  onClose: () => void;
};

const RELATIVE_THRESHOLDS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

const formatRelativeTime = (iso: string): string => {
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = new Date(iso).getTime() - Date.now();
  let value = diffMs / 1000;
  for (const [step, unit] of RELATIVE_THRESHOLDS) {
    if (Math.abs(value) < step) return fmt.format(Math.round(value), unit);
    value /= step;
  }
  return fmt.format(Math.round(value), "year");
};

export function NotesSheet({
  documentId,
  sections,
  currentOrder,
  refreshToken,
  onJumpToTarget,
  onClose,
}: NotesSheetProps) {
  const { client } = useSdk();
  const { theme } = useTheme();
  const [items, setItems] = useState<Note[] | null>(null);
  const [highlightsById, setHighlightsById] = useState<Map<string, Highlight>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const sectionInfoByKey = useMemo(() => {
    const map = new Map<string, { order: number; title: string }>();
    if (sections) {
      for (const s of sections) map.set(s.sectionKey, { order: s.order, title: s.title });
    }
    return map;
  }, [sections]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([client.note.list({ documentId }), client.highlight.list({ documentId })])
      .then(([notes, highlights]) => {
        if (cancelled) return;
        setItems(notes.data?.items ?? []);
        const map = new Map<string, Highlight>();
        for (const h of highlights.data?.items ?? []) map.set(h.id, h);
        setHighlightsById(map);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, documentId, refreshToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const backdropBg = theme === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(20, 15, 10, 0.35)";

  const cardBg =
    theme === "dark"
      ? "bg-[oklch(15%_0.008_240)]"
      : theme === "sepia"
        ? "bg-sepia-100"
        : "bg-bd-surface-raised";
  const noteBg =
    theme === "dark" ? "bg-[oklch(20%_0.010_240)]" : theme === "sepia" ? "bg-sepia-50" : "bg-bd-bg";
  const mutedColor =
    theme === "dark" ? "text-night-200" : theme === "sepia" ? "text-sepia-700" : "text-bd-fg-muted";
  const bodyColor =
    theme === "dark" ? "text-night-50" : theme === "sepia" ? "text-sepia-900" : "text-bd-fg";
  const activeRing =
    theme === "dark"
      ? "ring-1 ring-[oklch(40%_0.012_240)]"
      : theme === "sepia"
        ? "ring-1 ring-sepia-300"
        : "ring-1 ring-bd-border-strong";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes"
      className="fixed inset-0 z-20 flex flex-col justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ background: backdropBg }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-2xl outline-none"
      >
        <Sheet style={{ maxHeight: "70vh" }}>
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <div className="flex items-baseline gap-2">
              <span className="t-label-l">Notes</span>
              {items && (
                <span className={`t-body-s ${mutedColor}`}>
                  {items.length === 0
                    ? "No notes yet"
                    : `${items.length} ${items.length === 1 ? "note" : "notes"}`}
                </span>
              )}
            </div>
            <IconButton aria-label="Close" size="sm" onClick={onClose}>
              <Icons.Close size={16} />
            </IconButton>
          </div>

          <ul className="flex-1 overflow-y-auto" style={{ marginRight: -8, paddingRight: 8 }}>
            {error && <li className={`t-body-s mt-2 ${mutedColor}`}>{error}</li>}
            {items === null && <li className={`t-body-s mt-4 ${mutedColor}`}>Loading…</li>}
            {items && items.length === 0 && !error && (
              <li className={`t-body-s mt-4 ${mutedColor}`}>
                Highlight a passage or jot a thought to start your notebook.
              </li>
            )}
            {items?.map((n) => {
              const highlight = n.highlightId ? highlightsById.get(n.highlightId) : undefined;
              const sectionKey = n.sectionKey ?? highlight?.sectionKey ?? null;
              const info = sectionKey ? sectionInfoByKey.get(sectionKey) : undefined;
              const positionLabel = labelFor(info, n);
              const isCurrent = info?.order === currentOrder;
              const targetHighlightId = highlight?.id ?? null;
              return (
                <li key={n.id} className="mb-2 last:mb-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (info) onJumpToTarget?.(info.order, targetHighlightId, n.id);
                    }}
                    className={`block w-full rounded-xl p-3 text-left transition-colors ${cardBg} ${
                      isCurrent ? activeRing : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: highlight ? `var(--hl-${highlight.color})` : "currentColor",
                          opacity: highlight ? 1 : 0.4,
                        }}
                      />
                      <span className={`t-body-s ${mutedColor}`}>
                        {positionLabel} · {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    {highlight && (
                      <p
                        className={`mt-2 line-clamp-3 italic ${bodyColor}`}
                        style={{ fontFamily: "var(--font-reading)", fontSize: 13, lineHeight: 1.5 }}
                      >
                        "{highlight.textSnippet}"
                      </p>
                    )}
                    <p
                      className={`t-body-m mt-2 line-clamp-4 rounded-md p-2 ${noteBg} ${bodyColor}`}
                    >
                      {n.body}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Sheet>
      </div>
    </div>
  );
}

const labelFor = (info: { order: number; title: string } | undefined, note: Note): string => {
  if (info) return `Ch. ${info.order + 1} · ${info.title}`;
  if (note.highlightId) return "Highlight";
  if (note.sectionKey) return "Section";
  return "Document";
};
