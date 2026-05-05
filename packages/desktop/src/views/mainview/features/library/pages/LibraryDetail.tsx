import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Chip, ChipButton, Icons, Skeleton } from "@baindar/ui";
import type { Document, DocumentManifest, Highlight, Note } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { KIND_LABEL, HIGHLIGHT_COLOR } from "../constants";
import { DocumentShelfChips } from "../components/DocumentShelfChips";
import { LibraryCover } from "../components/LibraryCover";
import { AppSidebar } from "../components/AppSidebar";
import {
  NoteCard,
  NoteComposer,
  noteDateLabel,
  noteLocationLabel,
  noteMatchesFilter,
  type NoteFilter,
} from "../components/NoteCards";
import { NoteDialog, type NoteDialogDraft } from "../components/NoteDialog";
import { CreateShelfDialog } from "../components/ShelfDialogs";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { useSdk } from "../../../sdk";
import {
  estimateMinutes,
  formatWordCount,
  progressPercent,
  sectionOrderFromKey,
  sourceLabel,
} from "../utils/document";

type DetailTab = "contents" | "about" | "notes" | "highlights";

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reader = useProfileName();
  const { client } = useSdk();
  const { documents, uploading, uploadDocument } = useLibraryDocuments();
  const {
    shelves,
    customShelves,
    memberships,
    workingShelfId,
    createShelf,
    addDocumentToShelf,
    toggleDocumentShelf,
    refreshDocumentShelves,
  } = useLibraryShelves(documents);
  const [doc, setDoc] = useState<Document | null>(null);
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createShelfOpen, setCreateShelfOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("contents");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      client.document.get({ id }),
      client.document.getManifest({ id }),
      client.highlight.list({ documentId: id }),
      client.note.list({ documentId: id }),
    ])
      .then(([docRes, manifestRes, highlightRes, noteRes]) => {
        if (cancelled) return;
        if (!docRes.data) {
          setError("Document not found");
          return;
        }
        setDoc(docRes.data);
        setManifest(manifestRes.data ?? null);
        setHighlights(highlightRes.data?.items ?? []);
        setNotes(noteRes.data?.items ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, id]);

  const currentOrder = sectionOrderFromKey(doc?.progress?.sectionKey) ?? 0;
  const highlightsById = useMemo(() => {
    const map = new Map<string, Highlight>();
    for (const h of highlights) map.set(h.id, h);
    return map;
  }, [highlights]);
  const notesWithHighlights = useMemo(
    () =>
      notes.map((note) => ({
        ...note,
        highlight: note.highlightId ? highlightsById.get(note.highlightId) : undefined,
      })),
    [highlightsById, notes],
  );
  const filteredNotes = useMemo(
    () => notesWithHighlights.filter((note) => noteMatchesFilter(note, noteFilter)),
    [noteFilter, notesWithHighlights],
  );
  const noteCounts = useMemo(
    () => ({
      all: notes.length,
      attached: notes.filter((note) => note.highlightId).length,
      standalone: notes.filter((note) => !note.highlightId).length,
    }),
    [notes],
  );
  const pct = doc ? progressPercent(doc) : 0;

  const createStandaloneNote = async () => {
    if (!doc) return;
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      const res = await client.note.create({ documentId: doc.id, body: trimmed });
      if (res.data) {
        setNotes((prev) => [res.data, ...prev]);
        setNoteDraft("");
      }
    } finally {
      setSavingNote(false);
    }
  };

  const updateNote = async (draft: NoteDialogDraft) => {
    if (!editingNote) return;
    const res = await client.note.update({ id: editingNote.id, body: draft.body });
    if (!res.data) throw new Error("Could not update note");
    setNotes((prev) => prev.map((note) => (note.id === res.data.id ? res.data : note)));
    setEditingNote(null);
  };

  const deleteNote = async () => {
    if (!editingNote) return;
    const idToDelete = editingNote.id;
    const res = await client.note.delete({ id: idToDelete });
    if (res.error) throw new Error("Could not delete note");
    setNotes((prev) => prev.filter((note) => note.id !== idToDelete));
    setEditingNote(null);
  };

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bd-bg px-6 text-bd-fg">
        <div className="text-center">
          <p className="t-body-m text-error">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => navigate("/library")}>
            Back to library
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
        onCreateShelf={() => setCreateShelfOpen(true)}
      />

      {!doc ? (
        <DetailSkeleton />
      ) : (
        <section className="flex min-w-0 flex-1 overflow-hidden">
          <aside className="hidden w-[380px] shrink-0 flex-col gap-6 border-r border-bd-border px-9 py-10 lg:flex">
            <Button
              variant="ghost"
              size="sm"
              iconStart={<Icons.Back size={14} />}
              onClick={() => navigate("/library")}
              className="self-start"
            >
              Library
            </Button>
            <LibraryCover doc={doc} width={220} priority className="self-center" />
            <div className="text-center">
              <div className="t-label-s text-bd-fg-muted">{KIND_LABEL[doc.kind]} · EPUB</div>
              <h1 className="t-display-s mt-2 text-bd-fg">{doc.title}</h1>
              <div className="t-body-m mt-1 text-bd-fg-subtle">{sourceLabel(doc, manifest)}</div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={() => navigate(`/read/${doc.id}`)} className="w-full">
                Continue · {pct}% read
              </Button>
              <Button
                variant="secondary"
                iconStart={<Icons.Sparkles size={14} />}
                onClick={() => navigate(`/read/${doc.id}`)}
                className="w-full text-bd-accent"
              >
                Ask Baindar about this book
              </Button>
            </div>
            <Stats manifest={manifest} highlights={highlights.length} currentOrder={currentOrder} />
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-14 lg:py-10">
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="sm"
                iconStart={<Icons.Back size={14} />}
                onClick={() => navigate("/library")}
              >
                Library
              </Button>
              <div className="mt-5 flex gap-5">
                <LibraryCover doc={doc} width={116} priority className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="t-label-s text-bd-fg-muted">{KIND_LABEL[doc.kind]}</div>
                  <h1 className="t-display-xs mt-1 text-bd-fg">{doc.title}</h1>
                  <div className="t-body-s mt-1 text-bd-fg-subtle">
                    {sourceLabel(doc, manifest)}
                  </div>
                  <Button size="sm" className="mt-4" onClick={() => navigate(`/read/${doc.id}`)}>
                    Continue
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-1 overflow-x-auto border-b border-bd-border lg:mt-0">
              {[
                { id: "contents", name: "Contents", count: manifest?.sections.length ?? 0 },
                { id: "about", name: "About", count: null },
                { id: "notes", name: "Notes", count: notes.length },
                { id: "highlights", name: "Highlights", count: highlights.length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as DetailTab)}
                  className={[
                    "flex shrink-0 items-center gap-1.5 border-0 border-b-2 bg-transparent px-4 py-3 font-ui text-sm font-semibold",
                    activeTab === tab.id
                      ? "border-bd-fg text-bd-fg"
                      : "border-transparent text-bd-fg-muted",
                  ].join(" ")}
                >
                  {tab.name}
                  {typeof tab.count === "number" && (
                    <span className="font-mono text-[11px] font-normal text-bd-fg-muted">
                      · {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "notes" ? (
              <NotesTab
                notes={filteredNotes}
                noteFilter={noteFilter}
                noteCounts={noteCounts}
                draft={noteDraft}
                saving={savingNote}
                onDraftChange={setNoteDraft}
                onSaveDraft={createStandaloneNote}
                onFilterChange={setNoteFilter}
                onEdit={setEditingNote}
                onOpenReader={(note) => navigate(readerNotePath(doc.id, note))}
              />
            ) : activeTab === "highlights" ? (
              <HighlightsTab
                highlights={highlights}
                onOpen={(highlight) => navigate(readerHighlightPath(doc.id, highlight))}
              />
            ) : activeTab === "about" ? (
              <AboutTab doc={doc} manifest={manifest} />
            ) : (
              <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
                <Contents manifest={manifest} currentOrder={currentOrder} />
                <div className="flex flex-col gap-6">
                  <DocumentShelfChips
                    shelves={customShelves}
                    selectedShelves={memberships[doc.id] ?? []}
                    workingShelfId={workingShelfId}
                    onToggle={(shelf, selected) => {
                      void toggleDocumentShelf(shelf, doc.id, selected);
                    }}
                    onCreate={() => setCreateShelfOpen(true)}
                  />
                  <RecentNotes notes={notes} highlightsById={highlightsById} />
                </div>
              </div>
            )}
          </section>
        </section>
      )}
      {createShelfOpen && doc && (
        <CreateShelfDialog
          onCancel={() => setCreateShelfOpen(false)}
          onCreate={async (draft) => {
            const shelf = await createShelf(draft);
            if (shelf) {
              await addDocumentToShelf(shelf, doc.id);
              await refreshDocumentShelves(doc.id);
              setCreateShelfOpen(false);
            }
          }}
        />
      )}
      {editingNote && doc && (
        <NoteDialog
          title="Keep the thought clear."
          documents={[doc]}
          note={editingNote}
          initialDocumentId={doc.id}
          onCancel={() => setEditingNote(null)}
          onSave={updateNote}
          onDelete={deleteNote}
        />
      )}
    </main>
  );
}

function Stats({
  manifest,
  highlights,
  currentOrder,
}: {
  manifest: DocumentManifest | null;
  highlights: number;
  currentOrder: number;
}) {
  const stats = [
    { value: manifest?.chapterCount ?? "—", label: "chapters" },
    { value: highlights, label: "highlights" },
    { value: manifest ? formatWordCount(manifest.wordCount) : "—", label: "length" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 border-y border-bd-border py-4">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <div className="font-display text-[22px] font-medium text-bd-fg">{stat.value}</div>
          <div className="t-body-s text-bd-fg-muted">{stat.label}</div>
        </div>
      ))}
      <div className="col-span-3 text-center">
        <Chip variant="outline">Current chapter · {currentOrder + 1}</Chip>
      </div>
    </div>
  );
}

function Contents({
  manifest,
  currentOrder,
}: {
  manifest: DocumentManifest | null;
  currentOrder: number;
}) {
  if (!manifest) return <Skeleton height={360} className="rounded-xl" />;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="t-label-s text-bd-fg-muted">Contents</span>
        <span className="t-body-s text-bd-fg-muted">
          {manifest.chapterCount} chapters · {formatWordCount(manifest.wordCount)}
        </span>
      </div>
      <div>
        {manifest.sections.map((section) => {
          const current = section.order === currentOrder;
          const read = section.order < currentOrder;
          return (
            <div
              key={section.sectionKey}
              className={[
                "flex items-center gap-4 border-b border-bd-border py-3",
                current ? "rounded-md bg-bd-surface-raised px-3" : "",
              ].join(" ")}
            >
              <span className="min-w-6 font-mono text-[11px] text-bd-fg-muted">
                {String(section.order + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={["t-label-m line-clamp-2", current ? "font-semibold" : ""].join(" ")}
                >
                  {section.title || `Section ${section.order + 1}`}
                </div>
                <div className="t-body-s mt-0.5 text-[11px] text-bd-fg-muted">
                  {estimateMinutes(section)}
                </div>
              </div>
              {current && <Chip variant="active">Continue</Chip>}
              {read && !current && <Icons.Check size={14} color="var(--success)" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentNotes({
  notes,
  highlightsById,
}: {
  notes: Note[];
  highlightsById: Map<string, Highlight>;
}) {
  return (
    <aside className="border-bd-border xl:border-l xl:pl-7">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="t-label-s text-bd-fg-muted">Recent notes · {notes.length}</span>
        <span className="t-body-s font-semibold text-bd-accent">View all</span>
      </div>
      {notes.length === 0 ? (
        <p className="t-body-m border-t border-bd-border py-4 text-bd-fg-subtle">
          Notes you write while reading will collect here.
        </p>
      ) : (
        notes.slice(0, 5).map((note) => {
          const highlight = note.highlightId ? highlightsById.get(note.highlightId) : undefined;
          const accent = highlight ? HIGHLIGHT_COLOR[highlight.color] : "var(--bd-border-strong)";
          return (
            <div key={note.id} className="flex flex-col gap-1.5 border-b border-bd-border py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                <span className="t-body-s text-[11px] text-bd-fg-muted">
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
              </div>
              {highlight && (
                <blockquote
                  className="m-0 border-l-2 pl-3 font-reading text-[13px] leading-6 text-bd-fg"
                  style={{ borderColor: accent }}
                >
                  "{highlight.textSnippet}"
                </blockquote>
              )}
              <p className="t-body-s pl-3 text-bd-fg-subtle">
                <span className="italic">{note.body}</span>
              </p>
            </div>
          );
        })
      )}
    </aside>
  );
}

function NotesTab({
  notes,
  noteFilter,
  noteCounts,
  draft,
  saving,
  onDraftChange,
  onSaveDraft,
  onFilterChange,
  onEdit,
  onOpenReader,
}: {
  notes: Array<Note & { highlight?: Highlight }>;
  noteFilter: NoteFilter;
  noteCounts: Record<NoteFilter, number>;
  draft: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onSaveDraft: () => void;
  onFilterChange: (filter: NoteFilter) => void;
  onEdit: (note: Note) => void;
  onOpenReader: (note: Note & { highlight?: Highlight }) => void;
}) {
  return (
    <section className="pt-5">
      <NoteComposer
        value={draft}
        disabled={saving}
        onChange={onDraftChange}
        onSubmit={onSaveDraft}
      />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {[
          ["all", "All"],
          ["attached", "On highlight"],
          ["standalone", "Standalone"],
        ].map(([value, label]) => (
          <ChipButton
            key={value}
            variant={noteFilter === value ? "active" : "outline"}
            onClick={() => onFilterChange(value as NoteFilter)}
          >
            {label} · {noteCounts[value as NoteFilter]}
          </ChipButton>
        ))}
        <div className="min-w-3 flex-1" />
        <span className="t-body-s text-[11px] text-bd-fg-muted">By chapter</span>
      </div>

      {notes.length === 0 ? (
        <p className="t-body-m border-t border-bd-border py-6 text-bd-fg-subtle">
          Notes you write while reading will collect here.
        </p>
      ) : (
        notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            source={noteLocationLabel(note, note.highlight)}
            location={noteDateLabel(note.createdAt)}
            onEdit={() => onEdit(note)}
            onOpen={() => onOpenReader(note)}
            onAsk={() => onOpenReader(note)}
          />
        ))
      )}
    </section>
  );
}

function HighlightsTab({
  highlights,
  onOpen,
}: {
  highlights: Highlight[];
  onOpen: (highlight: Highlight) => void;
}) {
  return (
    <section className="pt-5">
      {highlights.length === 0 ? (
        <p className="t-body-m border-t border-bd-border py-6 text-bd-fg-subtle">
          Highlights you mark while reading will collect here.
        </p>
      ) : (
        highlights.map((highlight) => (
          <article key={highlight.id} className="border-b border-bd-border py-4">
            <button
              type="button"
              className="w-full border-0 bg-transparent p-0 text-left"
              onClick={() => onOpen(highlight)}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: HIGHLIGHT_COLOR[highlight.color] }}
                />
                <span className="t-body-s text-bd-fg-muted">
                  {noteDateLabel(highlight.createdAt)}
                </span>
              </div>
              <blockquote
                className="m-0 border-l-[3px] pl-3 font-reading text-base leading-7 text-bd-fg"
                style={{ borderColor: HIGHLIGHT_COLOR[highlight.color] }}
              >
                "{highlight.textSnippet}"
              </blockquote>
            </button>
          </article>
        ))
      )}
    </section>
  );
}

function readerHighlightPath(documentId: string, highlight: Highlight): string {
  const order = sectionOrderFromKey(highlight.sectionKey);
  const params = new URLSearchParams();
  if (order !== null) params.set("chapter", String(order));
  params.set("highlight", highlight.id);
  params.set("target", "1");
  return `/read/${documentId}?${params.toString()}`;
}

function readerNotePath(documentId: string, note: Note & { highlight?: Highlight }): string {
  const sectionKey = note.sectionKey ?? note.highlight?.sectionKey ?? null;
  const order = sectionKey ? sectionOrderFromKey(sectionKey) : null;
  const params = new URLSearchParams();
  if (order !== null) params.set("chapter", String(order));
  if (note.highlight) params.set("highlight", note.highlight.id);
  params.set("note", note.id);
  params.set("target", "1");
  return `/read/${documentId}?${params.toString()}`;
}

function AboutTab({ doc, manifest }: { doc: Document; manifest: DocumentManifest | null }) {
  return (
    <section className="max-w-2xl pt-6">
      <div className="t-label-s text-bd-fg-muted">About</div>
      <h2 className="t-display-xs mt-1 text-bd-fg">{doc.title}</h2>
      <p className="t-body-m mt-3 leading-7 text-bd-fg-subtle">
        {sourceLabel(doc, manifest)} ·{" "}
        {manifest ? formatWordCount(manifest.wordCount) : "Processing metadata"}
      </p>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <section className="flex min-w-0 flex-1 gap-8 p-10">
      <div className="hidden w-[300px] lg:block">
        <Skeleton className="aspect-[0.66/1] w-[220px] rounded-[4px]" />
        <Skeleton width="80%" height={28} className="mx-auto mt-6" />
        <Skeleton width="55%" height={16} className="mx-auto mt-3" />
      </div>
      <div className="flex-1">
        <Skeleton width="60%" height={42} />
        <Skeleton height={360} className="mt-8 rounded-xl" />
      </div>
    </section>
  );
}
