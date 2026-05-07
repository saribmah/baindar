import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Icons,
  useSmoothText,
  type ChatAction,
  type ChatReference,
  type ChatToolCall,
} from "@baindar/ui";
import { chatToolFromPart } from "../chatTools";
import {
  messageReferences,
  messageText,
  referenceDataPart,
  referenceDescription,
  referenceKey,
  referenceLabel,
  referenceToReaderPath,
  type BaindarChatMessage,
  type MessageReference,
} from "../messageReferences";

const agentsHost = import.meta.env.VITE_AGENTS_HOST || undefined;

type Props = {
  conversation: Conversation;
  pendingReferences?: ReadonlyArray<MessageReference>;
  draftSeed?: string;
  draftSeedKey?: string;
  onClear?: () => void;
  onClose?: () => void;
  onPendingReferencesChange?: (references: MessageReference[]) => void;
};

export function ConversationChatPane({
  conversation,
  pendingReferences = [],
  draftSeed,
  draftSeedKey,
  onClear,
  onClose,
  onPendingReferencesChange,
}: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastDraftSeedKeyRef = useRef<string | null>(null);
  const agent = useAgent({
    agent: "ChatAgent",
    name: conversation.id,
    host: agentsHost,
  });
  const { messages, sendMessage, status, clearHistory } = useAgentChat<unknown, BaindarChatMessage>(
    { agent, credentials: "include" },
  );
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

  useEffect(() => {
    if (!draftSeedKey || lastDraftSeedKeyRef.current === draftSeedKey) return;
    lastDraftSeedKeyRef.current = draftSeedKey;
    setDraft(draftSeed ?? "");
  }, [draftSeed, draftSeedKey]);

  const openReference = useCallback(
    (reference: MessageReference) => {
      navigate(referenceToReaderPath(reference, String(Date.now())));
    },
    [navigate],
  );

  const removePendingReference = useCallback(
    (reference: MessageReference) => {
      onPendingReferencesChange?.(
        pendingReferences.filter((item) => referenceKey(item) !== referenceKey(reference)),
      );
    },
    [onPendingReferencesChange, pendingReferences],
  );

  const handleSubmit = (value: string) => {
    if (isStreaming) return;
    if (pendingReferences.length > 0) {
      const parts: BaindarChatMessage["parts"] = [
        ...pendingReferences.map(referenceDataPart),
        { type: "text", text: value },
      ];
      void sendMessage({ role: "user", parts });
      onPendingReferencesChange?.([]);
    } else {
      void sendMessage({ text: value });
    }
    setDraft("");
    scrollToBottom("smooth", true);
  };

  const clear = () => {
    clearHistory();
    onPendingReferencesChange?.([]);
    onClear?.();
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bd-bg text-bd-fg">
      <div className="border-b border-bd-border px-6 py-5 lg:px-12">
        <div className="mx-auto flex max-w-[760px] items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="t-label-s text-bd-fg-muted">{sourceLabel(conversation)}</div>
            <h1 className="mt-1 truncate font-display text-[24px] font-medium leading-[1.2] tracking-[0] text-bd-fg">
              {conversation.title}
            </h1>
          </div>
          <button
            type="button"
            className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm text-bd-fg-subtle"
            onClick={clear}
          >
            Clear
          </button>
          {onClose && (
            <button
              type="button"
              className="bd-btn bd-btn-pill bd-btn-ghost bd-btn-sm text-bd-fg-subtle"
              onClick={onClose}
            >
              <Icons.Close size={12} />
              Close
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-7 lg:px-12"
        onScroll={handleScroll}
      >
        <ChatThread className="mx-auto w-full max-w-[760px]">
          {messages.length === 0 ? (
            <EmptyConversation />
          ) : (
            messages.map((message) => (
              <MessageTurn
                key={message.id}
                role={message.role}
                parts={message.parts}
                streaming={isStreaming && message.id === messages[messages.length - 1]?.id}
                onOpenReference={openReference}
                onContentChange={() => scrollToBottom("auto")}
              />
            ))
          )}
        </ChatThread>
      </div>

      <div className="border-t border-bd-border px-5 py-4 lg:px-12">
        <div className="mx-auto w-full max-w-[760px]">
          <ChatComposer
            value={draft}
            onValueChange={setDraft}
            onSubmit={handleSubmit}
            references={referencesToTags(pendingReferences, openReference, removePendingReference)}
            disabled={isStreaming}
            submitting={isStreaming}
            placeholder="Continue the thread..."
            suggestions={
              messages.length === 0
                ? ["Find my latest receipt", "Summarize recent notes", "What needs my attention?"]
                : ["Show sources", "Save this answer", "Compare with another document"]
            }
            onSuggestionPress={setDraft}
          />
        </div>
      </div>
    </section>
  );
}

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
  onOpenReference,
  onContentChange,
}: {
  role: string;
  parts: ReadonlyArray<unknown>;
  streaming: boolean;
  onOpenReference: (reference: MessageReference) => void;
  onContentChange?: () => void;
}) {
  const text = messageText(parts);
  const references = messageReferences(parts);
  const visibleText = useSmoothText(text, streaming && role !== "user");
  const renderedText = streaming && role !== "user" ? visibleText : text;

  useEffect(() => {
    if (streaming) onContentChange?.();
  }, [onContentChange, renderedText, streaming]);

  if (role === "user") {
    return (
      <ChatUserTurn references={referencesToTags(references, onOpenReference)}>{text}</ChatUserTurn>
    );
  }

  const tools = parts.map(chatToolFromPart).filter((tool): tool is ChatToolCall => tool !== null);
  const actions: ReadonlyArray<ChatAction> = text
    ? [
        {
          label: "Copy",
          icon: <Icons.Copy size={12} />,
          onPress: () => void navigator.clipboard?.writeText(text),
        },
        { label: "Quote", icon: <Icons.Reply size={12} /> },
        { label: "Share", icon: <Icons.Share size={12} /> },
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

function referencesToTags(
  references: ReadonlyArray<MessageReference>,
  onOpen: (reference: MessageReference) => void,
  onRemove?: (reference: MessageReference) => void,
): ChatReference[] {
  return references.map((reference) => ({
    id: referenceKey(reference),
    label: referenceLabel(reference),
    description: referenceDescription(reference),
    color: referenceColor(reference),
    onOpen: () => onOpen(reference),
    onRemove: onRemove ? () => onRemove(reference) : undefined,
  }));
}

function referenceColor(reference: MessageReference): string | undefined {
  if (reference.kind === "highlight" && reference.color) return `var(--hl-${reference.color})`;
  if (reference.kind === "passage") return "var(--bd-accent)";
  if (reference.kind === "note") return "var(--bd-fg-muted)";
  return "var(--wine-700)";
}

function sourceLabel(conversation: Conversation): string {
  if (conversation.primaryDocId) return "Reader conversation";
  return "Binder-wide conversation";
}
