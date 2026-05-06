import { useState, type FormEvent } from "react";
import type { Conversation } from "@baindar/sdk";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";

const agentsHost = import.meta.env.VITE_AGENTS_HOST || undefined;

type Props = {
  conversation: Conversation;
};

// Right-pane chat surface for a single conversation. The agent
// connection is keyed on `conversation.id` — switching conversations
// in the sidebar mounts a new ChatPane (via React's `key` prop on the
// caller side), which tears the old WebSocket down and opens a new one
// against the right DO instance. We don't try to reuse the agent stub
// across conversations.
export function ChatPane({ conversation }: Props) {
  const [draft, setDraft] = useState("");

  const agent = useAgent({
    agent: "ChatAgent",
    name: conversation.id,
    host: agentsHost,
  });

  const { messages, sendMessage, status, clearHistory } = useAgentChat({ agent });

  const isStreaming = status === "streaming" || status === "submitted";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isStreaming) return;
    void sendMessage({ text });
    setDraft("");
  };

  return (
    <main className="flex h-screen flex-1 flex-col bg-bd-bg text-bd-fg">
      <header className="flex items-center justify-between border-b border-bd-border px-4 py-3">
        <h1 className="truncate text-base font-semibold" title={conversation.title}>
          {conversation.title}
        </h1>
        <button
          type="button"
          className="text-xs text-bd-fg-muted hover:text-bd-fg"
          onClick={clearHistory}
        >
          clear
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-bd-fg-muted">Ask anything about your binder.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === "user"
                    ? "self-end max-w-[85%] rounded-lg bg-bd-bg-muted px-3 py-2"
                    : "self-start max-w-[85%] rounded-lg border border-bd-border px-3 py-2"
                }
              >
                <p className="text-xs uppercase tracking-wide text-bd-fg-muted">{m.role}</p>
                <div className="mt-1 whitespace-pre-wrap text-sm">
                  {m.parts.map((part, i) =>
                    part.type === "text" ? <span key={i}>{part.text}</span> : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-bd-border p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded border border-bd-border bg-transparent px-3 py-2 text-sm outline-none focus:border-bd-fg-muted"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isStreaming}
          className="rounded border border-bd-border px-4 py-2 text-sm hover:bg-bd-bg-muted disabled:opacity-50"
        >
          {isStreaming ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}
