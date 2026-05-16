import { useCallback, useEffect, useRef, useState } from "react";
import type { Conversation } from "@baindar/sdk";
import { useAgentChat } from "agents/ai-react";
import { useAgent } from "agents/react";
import {
  ChatAssistantTurn,
  ChatComposer,
  ChatPanelHeader,
  ChatThread,
  ChatToolCard,
  ChatUserTurn,
  IconButton,
  Icons,
  useSmoothText,
  type ChatAction,
  type ChatToolCall,
  type ChatToolKind,
  type ChatToolState,
} from "@baindar/ui";
import { BillingLimitDialog, useBillingStatus } from "../../billing";

const agentsHost = import.meta.env.VITE_AGENTS_HOST || undefined;

type Props = {
  conversation: Conversation;
  onClear?: () => void;
  onClose?: () => void;
};

export function ConversationChatPane({ conversation, onClear, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const { billing } = useBillingStatus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const agent = useAgent({
    agent: "ChatAgent",
    name: conversation.agentName,
    host: agentsHost,
  });
  const { messages, sendMessage, status, clearHistory } = useAgentChat({ agent });
  const isStreaming = status === "streaming" || status === "submitted";
  const latestMessage = messages[messages.length - 1];
  const latestMessageText = latestMessage ? messageText(latestMessage.parts) : "";

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto", force = false) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || (!force && !stickToBottomRef.current)) return;

    requestAnimationFrame(() => {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
    });
  }, []);

  const handleScroll = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const distanceFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 96;
  }, []);

  useEffect(() => {
    scrollToBottom(isStreaming ? "auto" : "smooth");
  }, [isStreaming, latestMessage?.id, latestMessageText, messages.length, scrollToBottom]);

  const handleSubmit = (value: string) => {
    if (isStreaming) return;
    if (isChatLimitReached(billing)) {
      setLimitDialogOpen(true);
      return;
    }
    void sendMessage({ text: value });
    setDraft("");
    scrollToBottom("smooth", true);
  };

  const clear = () => {
    clearHistory();
    onClear?.();
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-bd-bg text-bd-fg">
      <div className="border-b border-bd-border px-6 py-5 lg:px-12">
        <div className="mx-auto flex max-w-[760px] items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="t-label-s text-bd-fg-muted">{sourceLabel(conversation)}</div>
            <h1 className="mt-1 truncate font-display text-[24px] font-medium leading-[1.2] tracking-[0] text-bd-fg">
              {conversation.title}
            </h1>
          </div>
          {onClear && (
            <button
              type="button"
              className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm text-bd-fg-subtle"
              onClick={clear}
            >
              Clear
            </button>
          )}
          {onClose && (
            <IconButton aria-label="Close" size="sm" onClick={onClose}>
              <Icons.Close size={14} />
            </IconButton>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-7 lg:px-12"
        onScroll={handleScroll}
      >
        <ChatThread className="mx-auto max-w-[760px]">
          {messages.length === 0 ? (
            <EmptyConversation />
          ) : (
            messages.map((message) => (
              <MessageTurn
                key={message.id}
                role={message.role}
                parts={message.parts}
                streaming={isStreaming && message.id === messages[messages.length - 1]?.id}
                onContentChange={() => scrollToBottom("auto")}
              />
            ))
          )}
        </ChatThread>
      </div>

      <div className="border-t border-bd-border px-5 py-4 lg:px-12">
        <div className="mx-auto max-w-[760px]">
          <ChatComposer
            value={draft}
            onValueChange={setDraft}
            onSubmit={handleSubmit}
            disabled={isStreaming}
            submitting={isStreaming}
            placeholder="Continue the thread..."
            suggestions={
              messages.length === 0
                ? ["Find my latest receipt", "Summarize recent notes", "What needs my attention?"]
                : undefined
            }
            onSuggestionPress={setDraft}
          />
        </div>
      </div>
      <BillingLimitDialog
        billing={billing}
        kind="chat"
        open={limitDialogOpen}
        onClose={() => setLimitDialogOpen(false)}
      />
    </section>
  );
}

const isChatLimitReached = (billing: ReturnType<typeof useBillingStatus>["billing"]): boolean => {
  if (!billing || billing.quota.chatTurnsLimit < 0) return false;
  return billing.currentPeriod.chatTurns >= billing.quota.chatTurnsLimit;
};

function EmptyConversation() {
  return (
    <div className="flex min-h-[340px] flex-col justify-center">
      <ChatPanelHeader sub="ready" className="border-0 px-0" />
      <p className="max-w-[560px] font-reading text-[18px] leading-[1.65] text-bd-fg-subtle">
        Ask Baindar about anything in your binder. It can search documents, notes, highlights, and
        receipts before answering.
      </p>
    </div>
  );
}

function MessageTurn({
  role,
  parts,
  streaming,
  onContentChange,
}: {
  role: string;
  parts: ReadonlyArray<unknown>;
  streaming: boolean;
  onContentChange?: () => void;
}) {
  const text = messageText(parts);
  const visibleText = useSmoothText(text, streaming && role !== "user");
  const renderedText = streaming && role !== "user" ? visibleText : text;

  useEffect(() => {
    if (streaming) onContentChange?.();
  }, [onContentChange, renderedText, streaming]);

  if (role === "user") {
    return <ChatUserTurn>{text}</ChatUserTurn>;
  }

  const tools = parts.map(toolFromPart).filter((tool): tool is ChatToolCall => tool !== null);
  const actions: ReadonlyArray<ChatAction> = text
    ? [
        {
          label: "Copy",
          icon: <Icons.Copy size={12} />,
          onPress: () => void navigator.clipboard?.writeText(text),
        },
      ]
    : [];

  if (!text && tools.length > 0) {
    return (
      <div className="mb-7">
        <ChatPanelHeader sub={streaming ? "working..." : undefined} className="border-0 px-0" />
        {tools.map((tool, index) => (
          <ChatToolCard key={tool.id ?? index} tool={tool} />
        ))}
      </div>
    );
  }

  return (
    <ChatAssistantTurn
      sub={streaming ? "streaming" : undefined}
      tools={tools}
      actions={actions}
      streaming={streaming}
    >
      {renderedText || "Reading your binder..."}
    </ChatAssistantTurn>
  );
}

function messageText(parts: ReadonlyArray<unknown>): string {
  return parts
    .map((part) => {
      const record = asRecord(part);
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("");
}

function toolFromPart(part: unknown): ChatToolCall | null {
  const record = asRecord(part);
  if (typeof record.type !== "string" || !record.type.startsWith("tool-")) return null;
  const toolName = record.type.slice("tool-".length);
  return {
    id: typeof record.toolCallId === "string" ? record.toolCallId : toolName,
    kind: toolKind(toolName),
    state: toolState(record.state),
    query: toolQuery(record.input),
    error:
      typeof record.errorText === "string" && record.errorText.trim()
        ? truncate(record.errorText.trim(), 96)
        : undefined,
    results: toolResults(record.output),
  };
}

function toolKind(toolName: string): ChatToolKind {
  switch (toolName) {
    case "list_documents":
      return "documents";
    case "search_document":
      return "searchBook";
    case "search_binder":
      return "searchLibrary";
    case "read_section":
      return "lookup";
    case "get_summary":
      return "summarize";
    case "list_notes":
      return "notes";
    case "list_highlights":
      return "highlights";
    case "expand_query":
      return "generic";
    default:
      return "generic";
  }
}

function toolState(state: unknown): ChatToolState {
  if (state === "output-available") return "success";
  if (state === "output-error") return "error";
  if (state === "input-streaming" || state === "input-available") return "running";
  return "pending";
}

function toolQuery(input: unknown): string | undefined {
  const record = asRecord(input);
  const query =
    record.query ??
    record.original_query ??
    record.title ??
    record.document_id ??
    record.documentId ??
    record.section_key ??
    record.sectionKey ??
    record.target_key ??
    record.targetKey ??
    record.id;
  if (typeof query === "string" && query.trim()) return truncate(query.trim(), 72);
  if (Object.keys(record).length > 0) return truncate(JSON.stringify(record), 72);
  return undefined;
}

function toolResults(output: unknown): ChatToolCall["results"] {
  const items = Array.isArray(output) ? output : outputItems(output);
  if (items.length === 0) return undefined;
  return items.slice(0, 3).map((item, index) => {
    const record = asRecord(item);
    const label =
      record.documentTitle ??
      record.sectionTitle ??
      record.title ??
      record.name ??
      record.status ??
      record.page ??
      `Result ${index + 1}`;
    const text =
      record.snippet ??
      record.textSnippet ??
      record.body ??
      record.text ??
      record.preview ??
      record.summary ??
      record.message ??
      JSON.stringify(record);
    return {
      label: typeof label === "string" || typeof label === "number" ? String(label) : undefined,
      text: typeof text === "string" ? truncate(text, 160) : truncate(String(text), 160),
    };
  });
}

function outputItems(output: unknown): unknown[] {
  const record = asRecord(output);
  if (Array.isArray(record.chunks)) return record.chunks;
  if (Array.isArray(record.items)) return record.items;
  if (Object.keys(record).length > 0) return [record];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function sourceLabel(conversation: Conversation): string {
  if (conversation.primaryDocId) return "Reader conversation";
  return "Binder-wide conversation";
}
