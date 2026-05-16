import "../../../polyfills/agent-events.ts";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useRouter, type Href } from "expo-router";
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
  color,
  font,
  useSmoothText,
  useThemeColors,
  type ChatToolCall,
} from "@baindar/ui";
import type { Conversation } from "@baindar/sdk";
import { AGENTS_HOST } from "../../../config.ts";
import { useSdk } from "../../../sdk/sdk.provider.tsx";
import { BillingLimitSheet, useBillingStatus } from "../../billing";
import { chatToolFromPart } from "../chatTools.ts";
import {
  composerReferenceTags,
  messageReferences,
  messageText,
  referenceDataPart,
  referenceKey,
  referenceToReaderPath,
  referencesToTags,
  type BaindarChatMessage,
  type MessageReference,
} from "../messageReferences.ts";

type Props = {
  conversation: Conversation;
  pendingReferences?: ReadonlyArray<MessageReference>;
  contextReference?: MessageReference | null;
  draftSeed?: string;
  draftSeedKey?: string;
  onActivity?: () => void;
  onClear?: () => void;
  onClose?: () => void;
  onNewConversation?: () => void;
  onPendingReferencesChange?: (references: MessageReference[]) => void;
};

export function ConversationChatPane({
  conversation,
  pendingReferences = [],
  contextReference,
  draftSeed,
  draftSeedKey,
  onActivity,
  onClear,
  onClose,
  onNewConversation,
  onPendingReferencesChange,
}: Props) {
  const palette = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const router = useRouter();
  const { authHeaders } = useSdk();
  const [draft, setDraft] = useState("");
  const [limitSheetOpen, setLimitSheetOpen] = useState(false);
  const { billing } = useBillingStatus();
  const scrollRef = useRef<ScrollView>(null);
  const lastDraftSeedKeyRef = useRef<string | null>(null);
  const authedWebSocket = useMemo(() => createAuthedWebSocket(authHeaders), [authHeaders]);
  const agentClientId = useMemo(
    () =>
      `mobile-${conversation.id}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    [conversation.id],
  );
  const agent = useAgent({
    id: agentClientId,
    agent: "ChatAgent",
    name: conversation.agentName,
    host: AGENTS_HOST,
    WebSocket: authedWebSocket,
  });
  const { messages, sendMessage, status, clearHistory } = useAgentChat<unknown, BaindarChatMessage>(
    {
      agent,
      headers: authHeaders(),
      credentials: "include",
    },
  );
  const isStreaming = status === "streaming" || status === "submitted";
  const latestMessage = messages[messages.length - 1];
  const latestMessageText = latestMessage ? messageText(latestMessage.parts) : "";
  const composerBottomPadding = Math.max(insets.bottom, bottomTabBarHeight) + 12;

  const scrollToBottom = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    scrollToBottom(!isStreaming);
  }, [isStreaming, latestMessage?.id, latestMessageText, messages.length, scrollToBottom]);

  useEffect(() => {
    if (!draftSeedKey || lastDraftSeedKeyRef.current === draftSeedKey) return;
    lastDraftSeedKeyRef.current = draftSeedKey;
    setDraft(draftSeed ?? "");
  }, [draftSeed, draftSeedKey]);

  const openReference = useCallback(
    (reference: MessageReference) => {
      router.push(referenceToReaderPath(reference, String(Date.now())) as Href);
    },
    [router],
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
    if (isChatLimitReached(billing)) {
      setLimitSheetOpen(true);
      return;
    }
    const refs: MessageReference[] = [];
    const seen = new Set<string>();
    if (contextReference) {
      const key = referenceKey(contextReference);
      seen.add(key);
      refs.push(contextReference);
    }
    for (const ref of pendingReferences) {
      const key = referenceKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }

    const message =
      refs.length > 0
        ? {
            role: "user" as const,
            parts: [...refs.map(referenceDataPart), { type: "text" as const, text: value }],
          }
        : { text: value };

    Promise.resolve(sendMessage(message)).finally(() => onActivity?.());
    if (refs.length > 0) onPendingReferencesChange?.([]);
    setDraft("");
    scrollToBottom(true);
  };

  const clear = () => {
    clearHistory();
    onPendingReferencesChange?.([]);
    onClear?.();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <View style={styles.headerMain}>
          <Text style={[styles.kicker, { color: palette.fgMuted }]}>
            {sourceLabel(conversation)}
          </Text>
          <Text style={[styles.title, { color: palette.fg }]} numberOfLines={2}>
            {conversation.title}
          </Text>
        </View>
        {onClear && (
          <IconButton aria-label="Clear conversation" size="sm" onPress={clear}>
            <Icons.Trash size={15} color={palette.fgSubtle} />
          </IconButton>
        )}
        {onNewConversation && (
          <IconButton aria-label="Start new conversation" size="sm" onPress={onNewConversation}>
            <Icons.Plus size={15} color={palette.fg} />
          </IconButton>
        )}
        {onClose && (
          <IconButton aria-label="Close" size="sm" onPress={onClose}>
            <Icons.Close size={15} color={palette.fg} />
          </IconButton>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollToBottom(false)}
      >
        <ChatThread>
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
              />
            ))
          )}
        </ChatThread>
      </ScrollView>

      <View
        style={[
          styles.composerWrap,
          { borderTopColor: palette.border, paddingBottom: composerBottomPadding },
        ]}
      >
        <ChatComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={handleSubmit}
          references={composerReferenceTags(
            contextReference,
            pendingReferences,
            openReference,
            removePendingReference,
          )}
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
      </View>
      <BillingLimitSheet
        billing={billing}
        kind="chat"
        visible={limitSheetOpen}
        onClose={() => setLimitSheetOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const isChatLimitReached = (billing: ReturnType<typeof useBillingStatus>["billing"]): boolean => {
  if (!billing || billing.quota.chatTurnsLimit < 0) return false;
  return billing.currentPeriod.chatTurns >= billing.quota.chatTurnsLimit;
};

function EmptyConversation() {
  const palette = useThemeColors();
  return (
    <View style={styles.empty}>
      <ChatPanelHeader sub="ready" />
      <Text style={[styles.emptyText, { color: palette.fgSubtle }]}>
        Ask Baindar about anything in your binder. It can search documents, notes, highlights, and
        receipts before answering.
      </Text>
    </View>
  );
}

function MessageTurn({
  role,
  parts,
  streaming,
  onOpenReference,
}: {
  role: string;
  parts: ReadonlyArray<unknown>;
  streaming: boolean;
  onOpenReference: (reference: MessageReference) => void;
}) {
  const text = messageText(parts);
  const references = messageReferences(parts);
  const visibleText = useSmoothText(text, streaming && role !== "user");
  const renderedText = streaming && role !== "user" ? visibleText : text;

  if (role === "user") {
    return (
      <ChatUserTurn references={referencesToTags(references, onOpenReference)}>{text}</ChatUserTurn>
    );
  }

  const tools = parts.map(chatToolFromPart).filter((tool): tool is ChatToolCall => tool !== null);

  if (!text && tools.length > 0) {
    return (
      <View style={styles.toolsOnly}>
        <ChatPanelHeader sub={streaming ? "working..." : undefined} />
        {tools.map((tool, index) => (
          <ChatToolCard key={tool.id ?? index} tool={tool} />
        ))}
      </View>
    );
  }

  return (
    <ChatAssistantTurn
      sub={streaming ? "streaming" : undefined}
      tools={tools}
      streaming={streaming}
    >
      {renderedText || "Reading your binder..."}
    </ChatAssistantTurn>
  );
}

function createAuthedWebSocket(authHeaders: () => Record<string, string>): typeof WebSocket {
  const NativeWebSocket = globalThis.WebSocket as unknown as ReactNativeWebSocketConstructor;
  const AuthedWebSocket = function (
    this: WebSocket,
    url: string,
    protocols?: string | string[] | null,
  ) {
    return new NativeWebSocket(url, protocols ?? undefined, { headers: authHeaders() });
  };
  return AuthedWebSocket as unknown as typeof WebSocket;
}

type ReactNativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

function sourceLabel(conversation: Conversation): string {
  if (conversation.primaryDocId) return "Reader conversation";
  return "Binder-wide conversation";
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.44,
  },
  title: {
    marginTop: 3,
    fontFamily: font.nativeFamily.display,
    fontSize: 22,
    fontWeight: "500",
    lineHeight: 26,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  composerWrap: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  empty: {
    minHeight: 340,
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    maxWidth: 560,
    fontFamily: font.nativeFamily.reading,
    fontSize: 17,
    lineHeight: 27,
  },
  toolsOnly: {
    gap: 8,
    marginBottom: 18,
  },
});
