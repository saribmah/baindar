import { useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { ChipButton, Icons, Skeleton } from "@baindar/ui";
import type { Document, Highlight, Note } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { AppSidebar } from "../components/AppSidebar";
import {
  NoteCard,
  noteDateLabel,
  noteMatchesFilter,
  type NoteFilter,
} from "../components/NoteCards";
import { NoteDialog, type NoteDialogDraft } from "../components/NoteDialog";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryHighlights } from "../hooks/useLibraryHighlights";
import { useLibraryNotes } from "../hooks/useLibraryNotes";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { useSdk } from "../../../sdk";

type FilterItem = {
  value: NoteFilter;
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
};

const filters: FilterItem[] = [
  { value: "all", label: "All" },
  { value: "attached", label: "On a highlight", icon: Icons.Highlight },
  { value: "standalone", label: "Standalone", icon: Icons.Note },
];

export function Notes() {
  const navigate = useNavigate();
  const reader = useProfileName();
  const { client } = useSdk();
  const { documents, uploading, uploadDocument } = useLibraryDocuments();
  const { shelves } = useLibraryShelves(documents);
  const { highlights } = useLibraryHighlights(documents);
  const { notes, error, refresh } = useLibraryNotes(documents);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editor, setEditor] = useState<Note | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const highlightsById = useMemo(() => {
    const map = new Map<string, Highlight>();
    for (const item of highlights ?? []) map.set(item.id, item);
    return map;
  }, [highlights]);

  const enriched = useMemo(() => {
    if (!notes) return null;
    return notes.map((note) => ({
      ...note,
      highlight: note.highlightId ? highlightsById.get(note.highlightId) : undefined,
    }));
  }, [highlightsById, notes]);

  const visible = useMemo(
    () => enriched?.filter((note) => noteMatchesFilter(note, filter)) ?? null,
    [enriched, filter],
  );

  const countsByFilter = useMemo(() => {
    const items = enriched ?? [];
    return {
      all: items.length,
      attached: items.filter((note) => note.highlightId).length,
      standalone: items.filter((note) => !note.highlightId).length,
    };
  }, [enriched]);

  const sourceCounts = useMemo(() => {
    const map = new Map<string, { title: string; count: number }>();
    for (const note of notes ?? []) {
      const current = map.get(note.documentId) ?? { title: note.document.title, count: 0 };
      current.count += 1;
      map.set(note.documentId, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [notes]);

  const readyDocuments = useMemo(
    () => (documents ?? []).filter((doc) => doc.status === "processed"),
    [documents],
  );

  const saveNote = async (draft: NoteDialogDraft) => {
    if (!editor) return;
    setOperationError(null);
    const res = await client.note.update({ id: editor.id, body: draft.body });
    if (!res.data) throw new Error("Could not update note");
    setEditor(null);
    await refresh();
  };

  const deleteNote = async () => {
    if (!editor) return;
    setOperationError(null);
    const res = await client.note.delete({ id: editor.id });
    if (res.error) throw new Error("Could not delete note");
    setEditor(null);
    await refresh();
  };

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="flex min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-12 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <div>
              <div className="t-label-s text-bd-fg-muted">
                Notes · {countsByFilter.all} across {sourceCounts.length} sources ·{" "}
                {countsByFilter.standalone} standalone
              </div>
              <h1 className="mt-1 max-w-2xl font-display text-[clamp(34px,5vw,48px)] font-normal leading-[1.05]">
                What you've thought about.
              </h1>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {filters.map((item) => {
                const Icon = item.icon;
                return (
                  <ChipButton
                    key={item.value}
                    variant={filter === item.value ? "active" : "outline"}
                    onClick={() => setFilter(item.value)}
                  >
                    {Icon && <Icon size={11} color="currentColor" />}
                    {item.label} · {countsByFilter[item.value]}
                  </ChipButton>
                );
              })}
              <div className="h-5 w-px bg-bd-border" />
              <ChipButton variant="outline">Recent</ChipButton>
            </div>

            {(error || operationError) && (
              <p className="t-body-s mt-4 rounded-md bg-bd-surface-hover px-4 py-3 text-error">
                {operationError ?? error}
              </p>
            )}

            <div className="mt-2">
              {!visible ? (
                <NotesSkeleton />
              ) : visible.length === 0 ? (
                <p className="t-body-m border-t border-bd-border py-6 text-bd-fg-subtle">
                  No notes in this view yet.
                </p>
              ) : (
                visible.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    source={note.document.title}
                    location={`${noteDateLabel(note.createdAt)}`}
                    onEdit={() => setEditor(note)}
                    onOpen={() => navigate(readerNotePath(note))}
                    onAsk={() => navigate(readerNotePath(note, true))}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="hidden w-[300px] shrink-0 border-l border-bd-border px-7 py-8 xl:block">
          <div className="t-label-s mb-3 text-bd-fg-muted">By source</div>
          <div className="flex flex-col gap-1">
            {sourceCounts.map((source) => (
              <div key={source.title} className="flex items-center gap-3 rounded-md px-3 py-2">
                <span className="t-body-m min-w-0 flex-1 truncate text-bd-fg-subtle">
                  {source.title}
                </span>
                <span className="font-mono text-[11px] text-bd-fg-muted">{source.count}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {editor && (
        <NoteDialog
          title="Keep the thought clear."
          documents={readyDocuments}
          note={editor}
          initialDocumentId={editor.documentId}
          onCancel={() => setEditor(null)}
          onSave={saveNote}
          onDelete={deleteNote}
        />
      )}
    </main>
  );
}

function readerNotePath(
  note: Note & { document: Document; highlight?: Highlight },
  ask = false,
): string {
  const sectionKey = note.sectionKey ?? note.highlight?.sectionKey ?? null;
  const order = sectionKey ? sectionOrderFromKey(sectionKey) : null;
  const params = new URLSearchParams();
  if (order !== null) params.set("chapter", String(order));
  if (note.highlight) params.set("highlight", note.highlight.id);
  params.set("note", note.id);
  if (ask) params.set("ask", "note");
  params.set("target", "1");
  return `/read/${note.document.id}?${params.toString()}`;
}

function sectionOrderFromKey(sectionKey: string): number | null {
  const match = /:(\d+)$/.exec(sectionKey);
  return match ? Number(match[1]) : null;
}

function NotesSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="border-b border-bd-border py-4">
          <Skeleton width="45%" height={14} />
          <Skeleton width="92%" height={34} className="mt-3" />
          <Skeleton width="74%" height={42} className="mt-3" />
        </div>
      ))}
    </div>
  );
}
