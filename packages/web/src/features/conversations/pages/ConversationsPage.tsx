import { useState } from "react";
import { ChatConversationListItem, ChipButton, Icons, Skeleton, Toast } from "@baindar/ui";
import type { Conversation, Document } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { AppSidebar } from "../../library/components/AppSidebar";
import { useLibraryDocuments } from "../../library/hooks/useLibraryDocuments";
import { useLibraryShelves } from "../../library/hooks/useLibraryShelves";
import { ConversationChatPane } from "../components/ConversationChatPane";
import { useConversations } from "../hooks/useConversations";

export function ConversationsPage() {
  const reader = useProfileName();
  const { documents, uploading, uploadDocument, toast } = useLibraryDocuments();
  const { shelves } = useLibraryShelves(documents);
  const [filter, setFilter] = useState<"all" | "reader" | "binder">("all");
  const [menuId, setMenuId] = useState<string | null>(null);
  const { conversations, selected, selectedId, status, error, select, create, rename, remove } =
    useConversations();

  const visible = conversations.filter((conversation) => {
    if (filter === "reader") return conversation.primaryDocId !== null;
    if (filter === "binder") return conversation.primaryDocId === null;
    return true;
  });

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="min-w-0 flex-1 overflow-hidden px-6 pb-8 pt-16 lg:px-12 lg:py-8">
        <div className="mx-auto flex h-full max-w-7xl flex-col">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="t-label-s text-bd-fg-muted">
                Conversations · {conversations.length} · across your binder
              </div>
              <h1 className="mt-1 font-display text-[clamp(34px,5vw,48px)] font-normal leading-[1.05] tracking-[0]">
                What you've talked through.
              </h1>
            </div>
            <button
              type="button"
              className="bd-btn bd-btn-pill bd-btn-primary bd-btn-md"
              onClick={() => void create()}
            >
              <Icons.Plus size={14} />
              New conversation
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
            <ChipButton
              variant={filter === "all" ? "active" : "filled"}
              onClick={() => setFilter("all")}
            >
              All · {conversations.length}
            </ChipButton>
            <ChipButton
              variant={filter === "reader" ? "active" : "outline"}
              onClick={() => setFilter("reader")}
            >
              From a passage · {conversations.filter((item) => item.primaryDocId).length}
            </ChipButton>
            <ChipButton
              variant={filter === "binder" ? "active" : "outline"}
              onClick={() => setFilter("binder")}
            >
              Whole binder · {conversations.filter((item) => !item.primaryDocId).length}
            </ChipButton>
          </div>

          {error && (
            <p className="t-body-s mt-4 rounded-md bg-bd-surface-hover px-4 py-3 text-error">
              {error}
            </p>
          )}

          <div
            className={[
              "mt-6 grid min-h-0 flex-1 overflow-hidden",
              selected
                ? "grid-cols-1 rounded-[18px] border border-bd-border lg:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]"
                : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10",
            ].join(" ")}
          >
            <div
              className={
                selected
                  ? "min-h-0 overflow-y-auto px-5 py-4"
                  : "min-h-0 overflow-y-auto pr-0 lg:pr-5"
              }
            >
              {status === "loading" ? (
                <ConversationSkeleton />
              ) : visible.length === 0 ? (
                <EmptyList onCreate={() => void create()} />
              ) : (
                visible.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === selectedId}
                    menuOpen={menuId === conversation.id}
                    onSelect={() => {
                      setMenuId(null);
                      select(conversation.id);
                    }}
                    onMore={() =>
                      setMenuId((current) => (current === conversation.id ? null : conversation.id))
                    }
                    onRename={(title) => void rename(conversation.id, title)}
                    onDelete={() => void remove(conversation.id)}
                    onCloseMenu={() => setMenuId(null)}
                  />
                ))
              )}
            </div>

            {selected ? (
              <div className="hidden min-h-0 min-w-0 overflow-hidden border-l border-bd-border lg:flex">
                <ConversationChatPane key={selected.id} conversation={selected} />
              </div>
            ) : (
              <ConversationInsights
                conversations={conversations}
                documents={documents}
                onCreate={() => void create()}
              />
            )}
          </div>
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
          <Toast iconStart={<Icons.Check size={18} color="var(--success)" />}>{toast}</Toast>
        </div>
      )}
    </main>
  );
}

function ConversationRow({
  conversation,
  active,
  menuOpen,
  onSelect,
  onMore,
  onRename,
  onDelete,
  onCloseMenu,
}: {
  conversation: Conversation;
  active: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMore: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onCloseMenu: () => void;
}) {
  return (
    <div className="relative">
      <ChatConversationListItem
        active={active}
        conversation={{
          id: conversation.id,
          title: conversation.title,
          source: conversation.primaryDocId ? "Reader conversation" : "Binder-wide",
          when: relativeDate(conversation.lastActivityAt),
          preview: conversation.primaryDocId
            ? "Started from a passage in the reader"
            : "Across documents, notes, and highlights",
        }}
        moreLabel={`Actions for ${conversation.title}`}
        onClick={onSelect}
        onMore={onMore}
      />
      {menuOpen && (
        <ConversationActionsMenu
          conversation={conversation}
          onClose={onCloseMenu}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex gap-4">
          <Skeleton shape="circle" width={36} height={36} />
          <div className="min-w-0 flex-1">
            <Skeleton width="62%" height={18} />
            <Skeleton width="38%" height={12} className="mt-2" />
            <Skeleton width="78%" height={14} className="mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyList({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col justify-center gap-4">
      <p className="font-reading text-[18px] leading-[1.6] text-bd-fg-subtle">
        No conversations match this view.
      </p>
      <button
        type="button"
        className="bd-btn bd-btn-pill bd-btn-secondary bd-btn-sm"
        onClick={onCreate}
      >
        Start a conversation
      </button>
    </div>
  );
}

function ConversationInsights({
  conversations,
  documents,
  onCreate,
}: {
  conversations: readonly Conversation[];
  documents: readonly Document[] | null;
  onCreate: () => void;
}) {
  const sources = getSourceRows(conversations, documents).slice(0, 6);
  const suggestionSource = sources[0]?.title ?? "your binder";

  return (
    <aside className="hidden min-h-0 border-l border-bd-border pl-8 lg:block">
      <div className="t-label-s text-bd-fg-muted">By source</div>
      <div className="mt-5 space-y-5">
        {sources.map((source) => (
          <div key={source.id} className="flex items-baseline justify-between gap-4">
            <span className="t-body-m min-w-0 truncate text-bd-fg">{source.title}</span>
            <span className="t-label-s text-bd-fg-muted">{source.count}</span>
          </div>
        ))}
      </div>

      <div className="t-label-s mt-12 text-bd-fg-muted">Suggestions</div>
      <div className="mt-4 rounded-[12px] bg-bd-surface-raised p-4">
        <p className="t-body-s text-bd-fg-subtle">
          Start from {suggestionSource}, or ask a binder-wide question across your sources.
        </p>
        <button
          type="button"
          className="bd-btn bd-btn-pill bd-btn-secondary bd-btn-sm mt-4 w-full"
          onClick={onCreate}
        >
          Start a conversation
        </button>
      </div>
    </aside>
  );
}

function ConversationActionsMenu({
  conversation,
  onClose,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  onClose: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute right-0 top-12 z-20 w-40 rounded-[12px] border border-bd-border bg-bd-bg p-1 shadow-[var(--sh-md)]">
      <button
        type="button"
        className="t-body-s flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-bd-fg hover:bg-bd-surface-hover"
        onClick={() => {
          const title = window.prompt("Rename conversation", conversation.title);
          if (title?.trim()) onRename(title.trim());
          onClose();
        }}
      >
        Rename
      </button>
      <button
        type="button"
        className="t-body-s flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-error hover:bg-bd-surface-hover"
        onClick={() => {
          const confirmed = window.confirm(
            `Delete "${conversation.title}"? This cannot be undone.`,
          );
          if (confirmed) onDelete();
          onClose();
        }}
      >
        Delete
      </button>
    </div>
  );
}

function getSourceRows(
  conversations: readonly Conversation[],
  documents: readonly Document[] | null,
): Array<{ id: string; title: string; count: number }> {
  const documentTitles = new Map(documents?.map((document) => [document.id, document.title]) ?? []);
  const counts = new Map<string, { title: string; count: number }>();

  for (const conversation of conversations) {
    const id = conversation.primaryDocId ?? "binder";
    const title = conversation.primaryDocId
      ? (documentTitles.get(conversation.primaryDocId) ?? "Reader source")
      : "Whole binder";
    const row = counts.get(id);
    counts.set(id, { title, count: (row?.count ?? 0) + 1 });
  }

  if (counts.size === 0) {
    for (const document of documents?.slice(0, 4) ?? []) {
      counts.set(document.id, { title: document.title, count: 0 });
    }
  }

  return Array.from(counts, ([id, source]) => ({ id, ...source })).sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title),
  );
}

function relativeDate(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
