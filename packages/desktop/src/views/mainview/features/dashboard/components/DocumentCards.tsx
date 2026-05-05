import { Card, Chip } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { KIND_LABEL } from "../constants";
import { formatRelativeTime } from "../utils/date";
import { getProgressLabel } from "../utils/document";
import { DocumentActionsMenu } from "./DocumentActionsMenu";
import { DocumentCover } from "./DocumentCover";
import { ProgressLine } from "./ProgressLine";

export function ContinueCard({ doc, onOpen }: { doc: Document; onOpen: () => void }) {
  const subtitle = getProgressLabel(doc) ?? doc.originalFilename;

  return (
    <Card className="group flex min-w-0 items-center gap-4 px-4 py-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 border-0 bg-transparent p-0 text-left"
      >
        <DocumentCover doc={doc} width={52} height={70} />
        <div className="min-w-0 flex-1">
          <div className="t-label-s mb-1 text-bd-fg-muted">{KIND_LABEL[doc.kind]}</div>
          <div className="t-label-l truncate text-bd-fg">{doc.title}</div>
          <div className="t-body-s mt-1 truncate text-bd-fg-muted">{subtitle}</div>
          <ProgressLine doc={doc} />
        </div>
      </button>
    </Card>
  );
}

export function ProgressCard({ doc }: { doc: Document }) {
  return (
    <Card className="flex min-w-0 items-center gap-4 px-4 py-4">
      <DocumentCover doc={doc} width={52} height={70} />
      <div className="min-w-0 flex-1">
        <div className="t-label-l truncate text-bd-fg">{doc.title}</div>
        <div className="t-body-s mt-1 truncate text-bd-fg-muted">
          {doc.status === "failed" ? (doc.errorReason ?? "Failed") : "Processing..."}
        </div>
      </div>
      <Chip variant="outline" className="shrink-0">
        {KIND_LABEL[doc.kind]}
      </Chip>
    </Card>
  );
}

export function RecentDocumentCard({
  doc,
  onOpen,
  onRename,
  onDelete,
}: {
  doc: Document;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="relative border-0 bg-transparent p-0 text-left"
      >
        <DocumentCover doc={doc} fill />
      </button>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="t-label-m line-clamp-2 text-bd-fg">{doc.title}</div>
          <div className="t-body-s mt-1 truncate text-[11px] text-bd-fg-muted">
            {formatRelativeTime(doc.createdAt)}
          </div>
        </div>
        <DocumentActionsMenu onRename={onRename} onDelete={onDelete} compact />
      </div>
    </div>
  );
}
