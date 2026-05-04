import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChipButton, Icons, Input, Skeleton, Toast } from "@baindar/ui";
import type { Document, Shelf, ShelfCustom } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { FILTER_LABEL, type LibraryFilter } from "../constants";
import { LibraryActionsMenu } from "../components/LibraryActionsMenu";
import { LibraryCover } from "../components/LibraryCover";
import { DeleteDialog, RenameDialog } from "../components/LibraryDialogs";
import { AppSidebar } from "../components/AppSidebar";
import { CreateShelfDialog } from "../components/ShelfDialogs";
import { ShelfCard } from "../components/ShelfArtwork";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryHighlights } from "../hooks/useLibraryHighlights";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { progressPercent, sourceLabel, statusLabel } from "../utils/document";
import { CUSTOM_SHELF_LIMIT, shelfPath } from "../utils/shelf";

const filters: LibraryFilter[] = ["all", "books", "pdfs", "articles"];

export function Library() {
  const reader = useProfileName();
  const navigate = useNavigate();
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [createShelfOpen, setCreateShelfOpen] = useState(false);
  const [createShelfDocument, setCreateShelfDocument] = useState<Document | null>(null);
  const {
    documents,
    filteredDocuments,
    counts,
    error,
    uploading,
    toast,
    query,
    setQuery,
    filter,
    setFilter,
    uploadDocument,
    renameDocument,
    deleteDocument,
  } = useLibraryDocuments();
  const { highlights } = useLibraryHighlights(documents);
  const {
    shelves,
    customShelves,
    memberships,
    error: shelfError,
    toast: shelfToast,
    workingShelfId,
    createShelf,
    addDocumentToShelf,
    toggleDocumentShelf,
  } = useLibraryShelves(documents);

  const visible = filteredDocuments ?? [];
  const shelfCount = shelves?.length ?? customShelves.length;
  const headingMeta = useMemo(
    () =>
      `Your library · ${counts.all} ${counts.all === 1 ? "item" : "items"} · ${shelfCount} ${
        shelfCount === 1 ? "shelf" : "shelves"
      }`,
    [counts.all, shelfCount],
  );

  const openCreateShelf = (doc: Document | null = null) => {
    setCreateShelfDocument(doc);
    setCreateShelfOpen(true);
  };

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        totalCount={counts.all}
        highlightsCount={highlights?.length ?? 0}
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
        onCreateShelf={() => openCreateShelf()}
      />

      <section className="min-w-0 flex-1 overflow-hidden px-6 pb-8 pt-16 lg:px-12 lg:py-8">
        <div className="mx-auto flex h-full max-w-7xl flex-col">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="t-label-s text-bd-fg-muted">{headingMeta}</div>
              <h1 className="mt-1 font-display text-[clamp(34px,5vw,48px)] font-normal leading-[1.05]">
                Everything you've collected.
              </h1>
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter library..."
              iconEnd={<Icons.Search size={18} color="var(--bd-fg-muted)" />}
              wrapClassName="w-full lg:w-[320px]"
            />
          </div>

          <ShelfStrip
            shelves={shelves ?? []}
            shelvesLoaded={shelves !== null}
            onCreateShelf={() => openCreateShelf()}
            onOpenShelf={(shelf) => navigate(shelfPath(shelf))}
          />

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <ChipButton
                key={item}
                variant={filter === item ? "active" : "filled"}
                onClick={() => setFilter(item)}
                className="shrink-0"
              >
                {FILTER_LABEL[item]} · {counts[item]}
              </ChipButton>
            ))}
            <div className="min-w-4 flex-1" />
            <span className="t-body-s hidden text-bd-fg-muted sm:inline">Sort</span>
            <ChipButton variant="outline" className="shrink-0">
              Recently added <Icons.Chevron size={12} color="var(--bd-fg-subtle)" />
            </ChipButton>
          </div>

          {error && (
            <p className="t-body-s mt-4 rounded-md bg-bd-surface-hover px-4 py-3 text-error">
              {error}
            </p>
          )}
          {shelfError && (
            <p className="t-body-s mt-4 rounded-md bg-bd-surface-hover px-4 py-3 text-error">
              {shelfError}
            </p>
          )}

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-8">
            {documents === null ? (
              <LibrarySkeleton />
            ) : visible.length === 0 ? (
              <EmptyLibrary query={query} />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {visible.map((doc) => (
                  <LibraryCard
                    key={doc.id}
                    doc={doc}
                    shelfCount={memberships[doc.id]?.length ?? 0}
                    customShelves={customShelves}
                    selectedShelves={memberships[doc.id] ?? []}
                    workingShelfId={workingShelfId}
                    onOpen={() => {
                      if (doc.status === "processed") navigate(`/library/${doc.id}`);
                    }}
                    onRename={() => setRenameTarget(doc)}
                    onDelete={() => setDeleteTarget(doc)}
                    onToggleShelf={(shelf, selected) => {
                      void toggleDocumentShelf(shelf, doc.id, selected);
                    }}
                    onCreateShelf={() => openCreateShelf(doc)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {renameTarget && (
        <RenameDialog
          doc={renameTarget}
          onCancel={() => setRenameTarget(null)}
          onSave={async (title) => {
            await renameDocument(renameTarget, title);
            setRenameTarget(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          doc={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await deleteDocument(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      )}
      {createShelfOpen && (
        <CreateShelfDialog
          onCancel={() => {
            setCreateShelfOpen(false);
            setCreateShelfDocument(null);
          }}
          onCreate={async (draft) => {
            const shelf = await createShelf(draft);
            if (shelf && createShelfDocument) {
              await addDocumentToShelf(shelf, createShelfDocument.id);
            }
            if (shelf) {
              setCreateShelfOpen(false);
              setCreateShelfDocument(null);
            }
          }}
        />
      )}
      {(toast || shelfToast) && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <Toast iconStart={<Icons.Check size={18} color="var(--success)" />}>
            {shelfToast ?? toast}
          </Toast>
        </div>
      )}
    </main>
  );
}

function ShelfStrip({
  shelves,
  shelvesLoaded,
  onCreateShelf,
  onOpenShelf,
}: {
  shelves: ReadonlyArray<Shelf>;
  shelvesLoaded: boolean;
  onCreateShelf: () => void;
  onOpenShelf: (shelf: Shelf) => void;
}) {
  const visibleShelves = shelves.slice(0, CUSTOM_SHELF_LIMIT + 2);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="t-label-s text-bd-fg-muted">Shelves</span>
        <button
          type="button"
          className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm text-bd-fg-subtle"
          onClick={onCreateShelf}
        >
          <Icons.Plus size={13} color="currentColor" />
          New shelf
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {!shelvesLoaded &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} width={220} height={150} className="shrink-0 rounded-[14px]" />
          ))}
        {shelvesLoaded &&
          visibleShelves.map((shelf) => (
            <ShelfCard key={shelf.id} shelf={shelf} onClick={() => onOpenShelf(shelf)} />
          ))}
        {shelvesLoaded && (
          <button
            type="button"
            onClick={onCreateShelf}
            className="flex min-w-[180px] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-bd-border-strong bg-bd-bg text-bd-fg-muted hover:bg-bd-surface-hover"
          >
            <Icons.Plus size={18} color="currentColor" />
            <span className="t-label-m">New shelf</span>
          </button>
        )}
      </div>
    </section>
  );
}

function LibraryCard({
  doc,
  shelfCount,
  customShelves,
  selectedShelves,
  workingShelfId,
  onOpen,
  onRename,
  onDelete,
  onToggleShelf,
  onCreateShelf,
}: {
  doc: Document;
  shelfCount: number;
  customShelves: ReadonlyArray<ShelfCustom>;
  selectedShelves: ReadonlyArray<ShelfCustom>;
  workingShelfId: string | null;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleShelf: (shelf: ShelfCustom, selected: boolean) => void;
  onCreateShelf: () => void;
}) {
  const pct = progressPercent(doc);
  const finished = doc.status === "processed" && pct >= 100;
  const active = doc.status === "processed" && pct > 0 && pct < 100;

  return (
    <div className="group min-w-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={doc.status !== "processed"}
        className="relative w-full border-0 bg-transparent p-0 text-left disabled:cursor-default"
      >
        <LibraryCover doc={doc} />
        {shelfCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-bd-action/80 px-2 py-1 font-mono text-[9px] text-bd-action-fg">
            <Icons.Bookmark size={9} color="currentColor" />
            {shelfCount}
          </span>
        )}
      </button>
      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="t-label-m line-clamp-2 text-bd-fg">{doc.title}</div>
          <div className="t-body-s mt-1 truncate text-[11px] text-bd-fg-muted">
            {sourceLabel(doc)} · {statusLabel(doc)}
          </div>
          {active && (
            <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-bd-border">
              <div className="h-full rounded-full bg-bd-action" style={{ width: `${pct}%` }} />
            </div>
          )}
          {finished && (
            <div className="mt-1.5 flex items-center gap-1 text-success">
              <Icons.Check size={11} color="var(--success)" />
              <span className="t-body-s text-[10px]">Finished</span>
            </div>
          )}
        </div>
        <LibraryActionsMenu
          onRename={onRename}
          onDelete={onDelete}
          shelves={customShelves}
          selectedShelfIds={new Set(selectedShelves.map((shelf) => shelf.id))}
          workingShelfId={workingShelfId}
          onToggleShelf={onToggleShelf}
          onCreateShelf={onCreateShelf}
        />
      </div>
    </div>
  );
}

function EmptyLibrary({ query }: { query: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-bd-border-strong bg-bd-surface-raised px-6 text-center">
      <div>
        <h2 className="t-display-s text-bd-fg">{query ? "No matches" : "No documents yet"}</h2>
        <p className="t-body-m mt-2 max-w-md text-bd-fg-subtle">
          {query
            ? "Try a different title or filename."
            : "Use Add to library to import the first EPUB."}
        </p>
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-[0.66/1] w-full rounded-[4px]" />
          <Skeleton width="85%" height={14} className="mt-3" />
          <Skeleton width="55%" height={12} className="mt-2" />
        </div>
      ))}
    </div>
  );
}
