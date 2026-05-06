import { useSession } from "../../auth";
import { ChatPane } from "../components/ChatPane";
import { ConversationsList } from "../components/ConversationsList";
import { EmptyChatState } from "../components/EmptyChatState";
import { useConversations } from "../hooks/useConversations";

export function ChatPage() {
  const session = useSession();
  const userId = session.data?.user?.id;

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bd-bg text-bd-fg-muted">
        <p>Loading session…</p>
      </main>
    );
  }

  return <ChatLayout />;
}

function ChatLayout() {
  const { conversations, selected, selectedId, status, error, select, create, rename, remove } =
    useConversations();

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bd-bg text-bd-fg-muted">
        <p>Loading chat…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bd-bg text-bd-fg">
        <p className="text-sm text-red-400">{error ?? "Something went wrong."}</p>
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-bd-bg text-bd-fg">
      <ConversationsList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={select}
        onCreate={() => void create()}
        onRename={(id, title) => void rename(id, title)}
        onDelete={(id) => void remove(id)}
      />
      {selected ? (
        // `key` forces a fresh ChatPane (and a fresh agent connection)
        // when the user switches conversations. Without it, useAgent's
        // hook reuses the existing WebSocket and the wrong DO would
        // receive the next message.
        <ChatPane key={selected.id} conversation={selected} />
      ) : (
        <EmptyChatState onCreate={() => void create()} />
      )}
    </div>
  );
}
