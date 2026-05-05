import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, ChipButton, Icons, Skeleton, Toast } from "@baindar/ui";
import type { Document, Shelf, ShelfCustom } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { LibraryActionsMenu } from "../components/LibraryActionsMenu";
import { LibraryCover } from "../components/LibraryCover";
import { AppSidebar } from "../components/AppSidebar";
import { AddBooksDialog, CreateShelfDialog, EditShelfDialog } from "../components/ShelfDialogs";
import { SpineFan } from "../components/ShelfArtwork";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { useSdk } from "../../../sdk";
import { progressPercent, sourceLabel, statusLabel } from "../utils/document";
import { shelfDescription, shelfItemNoun } from "../utils/shelf";

type ShelfFilter = "all" | "reading" | "finished";

const shelfFilters: ShelfFilter[] = ["all", "reading", "finished"];

export function ShelfDetail() {
  const { id } = useParams<{ id: string }>();
  const shelfId = id ? decodeURIComponent(id) : "";
  const navigate = useNavigate();
  const reader = useProfileName();
  const { client } = useSdk();
  const { documents, uploading, uploadDocument } = useLibraryDocuments();
  const {
    shelves,
    customShelves,
    memberships,
    error: shelfListError,
    toast: shelfToast,
    workingShelfId,
    createShelf,
    updateShelf,
    deleteShelf,
    addDocumentToShelf,
    toggleDocumentShelf,
  } = useLibraryShelves(documents);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [shelfDocuments, setShelfDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ShelfFilter>("all");
  const [addBooksOpen, setAddBooksOpen] = useState(false);
  const [createShelfOpen, setCreateShelfOpen] = useState(false);
  const [editShelfOpen, setEditShelfOpen] = useState(false);

  const refreshShelf = useCallback(async () => {
    if (!shelfId) return;
    try {
      const shelfFromList = shelves?.find((item) => item.id === shelfId) ?? null;
      const [shelfRes, docsRes] = await Promise.all([
        shelfFromList
          ? Promise.resolve({ data: shelfFromList })
          : client.shelf.get({ id: shelfId }),
        client.shelf.listDocuments({ id: shelfId }),
      ]);
      if (!shelfRes.data) throw new Error("Shelf not found");
      if (!docsRes.data) throw new Error("Failed to load shelf documents");
      const fetchedShelf = shelfRes.data;
      const fetchedDocs = docsRes.data.items;
      setShelf(fetchedShelf);
      setShelfDocuments(fetchedDocs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, shelfId, shelves]);

  useEffect(() => {
    void refreshShelf();
  }, [refreshShelf]);

  const currentIds = useMemo(
    () => new Set((shelfDocuments ?? []).map((doc) => doc.id)),
    [shelfDocuments],
  );
  const visibleDocuments = useMemo(() => {
    if (!shelfDocuments) return null;
    return shelfDocuments.filter((doc) => {
      const pct = progressPercent(doc);
      if (filter === "reading") return pct > 0 && pct < 100;
      if (filter === "finished") return pct >= 100;
      return true;
    });
  }, [filter, shelfDocuments]);
  const filterCounts = useMemo(() => {
    const items = shelfDocuments ?? [];
    return {
      all: items.length,
      reading: items.filter((doc) => {
        const pct = progressPercent(doc);
        return pct > 0 && pct < 100;
      }).length,
      finished: items.filter((doc) => progressPercent(doc) >= 100).length,
    };
  }, [shelfDocuments]);

  const customShelf = shelf?.kind === "custom" ? shelf : null;

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
        activeShelfId={shelfId}
        onCreateShelf={() => setCreateShelfOpen(true)}
      />

      <section className="min-w-0 flex-1 overflow-hidden px-6 pb-7 pt-16 lg:px-14 lg:py-7">
        <div className="mx-auto flex h-full max-w-7xl flex-col">
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              iconStart={<Icons.Back size={14} />}
              onClick={() => navigate("/library")}
            >
              Library
            </Button>
            <span className="t-body-s text-bd-fg-muted">/</span>
            <span className="t-body-m text-bd-fg-subtle">Shelves</span>
          </div>

          {error || shelfListError ? (
            <div className="rounded-md bg-bd-surface-hover px-4 py-3 text-error">
              {error ?? shelfListError}
            </div>
          ) : !shelf ? (
            <Skeleton height={190} className="rounded-[20px]" />
          ) : (
            <>
              <ShelfHero
                shelf={shelf}
                onAddBooks={customShelf ? () => setAddBooksOpen(true) : undefined}
                onEdit={customShelf ? () => setEditShelfOpen(true) : undefined}
              />

              <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
                {shelfFilters.map((item) => (
                  <ChipButton
                    key={item}
                    variant={filter === item ? "active" : "filled"}
                    onClick={() => setFilter(item)}
                    className="shrink-0 capitalize"
                  >
                    {item} · {filterCounts[item]}
                  </ChipButton>
                ))}
                <div className="min-w-4 flex-1" />
                <span className="t-body-s hidden text-bd-fg-muted sm:inline">Sort</span>
                <ChipButton variant="outline" className="shrink-0">
                  {customShelf ? "Manually" : "Recently touched"}
                  <Icons.Chevron size={12} color="var(--bd-fg-subtle)" />
                </ChipButton>
              </div>

              <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-8">
                {visibleDocuments === null ? (
                  <ShelfSkeleton />
                ) : visibleDocuments.length === 0 ? (
                  <EmptyShelf custom={Boolean(customShelf)} onAdd={() => setAddBooksOpen(true)} />
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {visibleDocuments.map((doc) => (
                      <ShelfDocumentCard
                        key={doc.id}
                        doc={doc}
                        customShelves={customShelves}
                        selectedShelves={memberships[doc.id] ?? []}
                        workingShelfId={workingShelfId}
                        onOpen={() => navigate(`/library/${doc.id}`)}
                        onToggleShelf={(targetShelf, selected) => {
                          void toggleDocumentShelf(targetShelf, doc.id, selected).then(() => {
                            if (targetShelf.id === shelfId) void refreshShelf();
                          });
                        }}
                        onCreateShelf={() => setCreateShelfOpen(true)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {customShelf && addBooksOpen && documents && (
        <AddBooksDialog
          shelf={customShelf}
          documents={documents}
          currentDocumentIds={currentIds}
          onCancel={() => setAddBooksOpen(false)}
          onAdd={async (doc) => {
            await addDocumentToShelf(customShelf, doc.id);
            await refreshShelf();
          }}
        />
      )}
      {createShelfOpen && (
        <CreateShelfDialog
          onCancel={() => setCreateShelfOpen(false)}
          onCreate={async (draft) => {
            const created = await createShelf(draft);
            if (created) {
              setCreateShelfOpen(false);
              navigate(`/library/shelves/${encodeURIComponent(created.id)}`);
            }
          }}
        />
      )}
      {customShelf && editShelfOpen && (
        <EditShelfDialog
          shelf={customShelf}
          onCancel={() => setEditShelfOpen(false)}
          onSave={async (draft) => {
            const updated = await updateShelf(customShelf, {
              name: draft.name.trim(),
              description: draft.description.trim() ? draft.description.trim() : null,
            });
            if (updated) {
              setShelf(updated);
              setEditShelfOpen(false);
            }
          }}
          onDelete={async () => {
            const deleted = await deleteShelf(customShelf);
            if (deleted) navigate("/library");
          }}
        />
      )}
      {shelfToast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <Toast iconStart={<Icons.Check size={18} color="var(--success)" />}>{shelfToast}</Toast>
        </div>
      )}
    </main>
  );
}

function ShelfHero({
  shelf,
  onAddBooks,
  onEdit,
}: {
  shelf: Shelf;
  onAddBooks?: () => void;
  onEdit?: () => void;
}) {
  const description = shelfDescription(shelf);

  return (
    <section className="flex flex-col gap-5 rounded-[20px] bg-bd-surface-raised p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
      <SpineFan shelf={shelf} size={70} />
      <div className="min-w-0 flex-1">
        <div className="t-label-s text-bd-fg-muted">
          {shelf.kind === "smart" ? "Smart shelf" : "Shelf"} · {shelf.itemCount}{" "}
          {shelfItemNoun(shelf.itemCount)}
        </div>
        <h1 className="mt-1 max-w-3xl font-display text-[clamp(30px,4vw,42px)] font-normal leading-[1.04]">
          {shelf.name}.
        </h1>
        {description && (
          <p className="t-body-l mt-2 max-w-2xl italic text-bd-fg-subtle">{description}</p>
        )}
      </div>
      {(onAddBooks || onEdit) && (
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
          {onAddBooks && (
            <Button variant="secondary" className="text-bd-accent" onClick={onAddBooks}>
              Add books
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit shelf
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ShelfDocumentCard({
  doc,
  customShelves,
  selectedShelves,
  workingShelfId,
  onOpen,
  onToggleShelf,
  onCreateShelf,
}: {
  doc: Document;
  customShelves: ReadonlyArray<ShelfCustom>;
  selectedShelves: ReadonlyArray<ShelfCustom>;
  workingShelfId: string | null;
  onOpen: () => void;
  onToggleShelf: (shelf: ShelfCustom, selected: boolean) => void;
  onCreateShelf: () => void;
}) {
  const pct = progressPercent(doc);
  const finished = doc.status === "processed" && pct >= 100;
  const active = doc.status === "processed" && pct > 0 && pct < 100;

  return (
    <div className="group min-w-0">
      <button type="button" onClick={onOpen} className="w-full border-0 bg-transparent p-0">
        <LibraryCover doc={doc} />
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

function EmptyShelf({ custom, onAdd }: { custom: boolean; onAdd: () => void }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-bd-border-strong bg-bd-surface-raised px-6 text-center">
      <div>
        <h2 className="t-display-s text-bd-fg">No books here yet</h2>
        <p className="t-body-m mt-2 max-w-md text-bd-fg-subtle">
          {custom
            ? "Add processed books from your library to build this shelf."
            : "This smart shelf fills itself as you read."}
        </p>
        {custom && (
          <Button variant="secondary" className="mt-4 text-bd-accent" onClick={onAdd}>
            Add books
          </Button>
        )}
      </div>
    </div>
  );
}

function ShelfSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-[0.66/1] w-full rounded-[4px]" />
          <Skeleton width="85%" height={14} className="mt-3" />
          <Skeleton width="55%" height={12} className="mt-2" />
        </div>
      ))}
    </div>
  );
}
