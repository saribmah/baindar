import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icons, Toast } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { AppSidebar } from "../../library/components/AppSidebar";
import { useLibraryHighlights } from "../../library/hooks/useLibraryHighlights";
import { useLibraryShelves } from "../../library/hooks/useLibraryShelves";
import { DashboardContent } from "../components/DashboardContent";
import { DropDashboard, FilteredEmpty } from "../components/DashboardEmptyStates";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardLoading } from "../components/DashboardLoading";
import { DeleteDialog, RenameDialog } from "../components/DocumentDialogs";
import { useDashboardDocuments } from "../hooks/useDashboardDocuments";

export function Dashboard() {
  const navigate = useNavigate();
  const reader = useProfileName();
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const {
    documents,
    pendingDocuments,
    inProgressDocuments,
    recentDocuments,
    hasDocuments,
    isFilteredEmpty,
    error,
    uploading,
    toast,
    query,
    setQuery,
    uploadDocument,
    renameDocument,
    deleteDocument,
  } = useDashboardDocuments();
  const { highlights } = useLibraryHighlights(documents);
  const { shelves } = useLibraryShelves(documents);

  return (
    <main className="flex min-h-screen bg-bd-bg text-bd-fg">
      <AppSidebar
        totalCount={documents?.length ?? 0}
        highlightsCount={highlights?.length ?? 0}
        reader={reader}
        onUpload={uploadDocument}
        uploading={uploading}
        shelves={shelves}
      />

      <section className="min-w-0 flex-1 px-6 pb-8 pt-16 lg:px-12 lg:py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7">
          <DashboardHeader
            reader={reader}
            query={query}
            onQuery={setQuery}
            showSearch={hasDocuments}
          />

          {error && (
            <p className="t-body-s rounded-md bg-bd-surface-hover px-4 py-3 text-error">{error}</p>
          )}

          {documents === null ? (
            <DashboardLoading />
          ) : isFilteredEmpty ? (
            <FilteredEmpty query={query} />
          ) : !hasDocuments ? (
            <DropDashboard uploading={uploading} onUpload={uploadDocument} />
          ) : (
            <DashboardContent
              inProgress={inProgressDocuments.slice(0, 3)}
              recent={recentDocuments.slice(0, 6)}
              pending={pendingDocuments}
              onUpload={uploadDocument}
              uploading={uploading}
              onOpen={(doc) => navigate(`/read/${doc.id}`)}
              onRename={setRenameTarget}
              onDelete={setDeleteTarget}
            />
          )}
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

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <Toast iconStart={<Icons.Check size={18} color="var(--success)" />}>{toast}</Toast>
        </div>
      )}
    </main>
  );
}
