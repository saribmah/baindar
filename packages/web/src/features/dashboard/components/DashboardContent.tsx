import { Card } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { ContinueCard, ProgressCard, RecentDocumentCard } from "./DocumentCards";
import { QuickAdd } from "./UploadControls";
import { SectionHeading } from "./SectionHeading";

export function DashboardContent({
  inProgress,
  recent,
  pending,
  uploading,
  onUpload,
  onOpen,
  onOpenDetails,
  onSeeAllInProgress,
  onSeeAllRecent,
  onRename,
  onDelete,
}: {
  inProgress: Document[];
  recent: Document[];
  pending: Document[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onOpen: (doc: Document) => void;
  onOpenDetails: (doc: Document) => void;
  onSeeAllInProgress: () => void;
  onSeeAllRecent: () => void;
  onRename: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <QuickAdd uploading={uploading} onUpload={onUpload} />

      {pending.length > 0 && (
        <section>
          <SectionHeading title="Processing" meta={`${pending.length} queued`} />
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
            {pending.slice(0, 3).map((doc) => (
              <ProgressCard key={doc.id} doc={doc} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          title="Pick up where you left off"
          meta="See all"
          onMetaClick={onSeeAllInProgress}
        />
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          {inProgress.length > 0 ? (
            inProgress.map((doc) => (
              <ContinueCard key={doc.id} doc={doc} onOpen={() => onOpen(doc)} />
            ))
          ) : (
            <Card className="px-5 py-6 xl:col-span-3">
              <p className="t-body-m text-bd-fg-subtle">
                Open a document and Baindar will keep your place here.
              </p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionHeading title="Recently added" meta="See all" onMetaClick={onSeeAllRecent} />
        <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {recent.map((doc) => (
            <RecentDocumentCard
              key={doc.id}
              doc={doc}
              onOpen={() => onOpenDetails(doc)}
              onRename={() => onRename(doc)}
              onDelete={() => onDelete(doc)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
