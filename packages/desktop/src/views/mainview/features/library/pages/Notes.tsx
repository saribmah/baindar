import { useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ChipButton, Icons, Skeleton } from "@baindar/ui";
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
  const { documents, counts, uploading, uploadDocument } = useLibraryDocuments();
  const { shelves } = useLibraryShelves(documents);
  const { highlights } = useLibraryHighlights(documents);
  const { notes, error, refresh } = useLibraryNotes(documents);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editor, setEditor] = useState<Note | "new" | null>(null);
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
    setOperationError(null);
    if (editor && editor !== "new") {
      const res = await client.note.update({ id: editor.id, body: draft.body });
      if (!res.data) throw new Error("Could not update note");
    } else {
      const res = await client.note.create({ documentId: draft.documentId, body: draft.body });
      if (!res.data) throw new Error("Could not create note");
    }
    setEditor(null);
    await refresh();
  };

  const deleteNote = async () => {
    if (!editor || editor === "new") return;
    setOperationError(null);
    const res = await client.note.delete({ id: editor.id });
    if (res.error) throw new Error("Could not delete note");
    setEditor(null);
    await refresh();
  };

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        totalCount={counts.all}
        highlightsCount={highlights?.length ?? 0}
        notesCount={notes?.length ?? undefined}
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="flex min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-12 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="t-label-s text-bd-fg-muted">
                  Notes · {countsByFilter.all} across {sourceCounts.length} sources ·{" "}
                  {countsByFilter.standalone} standalone
                </div>
                <h1 className="mt-1 max-w-2xl font-display text-[clamp(34px,5vw,48px)] font-normal leading-[1.05]">
                  What you've thought about.
                </h1>
              </div>
              <Button
                iconStart={<Icons.Plus size={14} />}
                disabled={readyDocuments.length === 0}
                onClick={() => setEditor("new")}
              >
                New note
              </Button>
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
                    onAsk={() => navigate(readerNotePath(note))}
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

          <div className="t-label-s mb-3 mt-8 text-bd-fg-muted">Standalone notes</div>
          <div className="rounded-xl bg-bd-surface-raised px-4 py-3.5">
            <p className="t-body-s m-0 leading-6 text-bd-fg-subtle">
              Notes that aren't tied to a highlight: chapter-level reflections, quick thoughts, and
              whole-book reminders.
            </p>
            <Button
              size="sm"
              variant="secondary"
              iconStart={<Icons.Plus size={12} />}
              disabled={readyDocuments.length === 0}
              className="mt-3 w-full"
              onClick={() => setEditor("new")}
            >
              New standalone note
            </Button>
          </div>

          <div className="t-label-s mb-3 mt-8 text-bd-fg-muted">Export</div>
          <button className="bd-btn bd-btn-rounded bd-btn-secondary bd-btn-sm mb-2 w-full">
            Export to Markdown
          </button>
          <button className="bd-btn bd-btn-rounded bd-btn-secondary bd-btn-sm w-full">
            Send to Notion
          </button>
        </aside>
      </section>

      {editor && (
        <NoteDialog
          title={editor === "new" ? "Capture a thought." : "Keep the thought clear."}
          documents={readyDocuments}
          note={editor === "new" ? null : editor}
          initialDocumentId={editor === "new" ? readyDocuments[0]?.id : editor.documentId}
          onCancel={() => setEditor(null)}
          onSave={saveNote}
          onDelete={editor === "new" ? undefined : deleteNote}
        />
      )}
    </main>
  );
}

function readerNotePath(note: Note & { document: Document; highlight?: Highlight }): string {
  const sectionKey = note.sectionKey ?? note.highlight?.sectionKey ?? null;
  const order = sectionKey ? sectionOrderFromKey(sectionKey) : null;
  const params = new URLSearchParams();
  if (order !== null) params.set("chapter", String(order));
  if (note.highlight) params.set("highlight", note.highlight.id);
  params.set("note", note.id);
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
