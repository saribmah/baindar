import type { Conversation } from "@baindar/sdk";
import { ConversationRow } from "./ConversationRow";

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

// Left-rail sidebar. Sticky "+ New" at the top; rows scroll. Empty
// list shows a subtle placeholder so the rail isn't a void — the main
// "start your first conversation" affordance lives in the chat pane,
// not here.
export function ConversationsList({
  conversations,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-bd-border bg-bd-bg">
      <div className="flex items-center justify-between border-b border-bd-border px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-bd-fg-muted">
          Conversations
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className="rounded border border-bd-border px-2 py-0.5 text-xs hover:bg-bd-bg-muted"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="px-3 py-2 text-xs text-bd-fg-muted">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-1">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={c.id === selectedId}
                onSelect={() => onSelect(c.id)}
                onRename={(title) => onRename(c.id, title)}
                onDelete={() => onDelete(c.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
