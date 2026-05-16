import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChatConversationListItem,
  Icons,
  Skeleton,
  color,
  font,
  useThemeColors,
} from "@baindar/ui";
import type { Conversation } from "@baindar/sdk";
import { PlanBadge } from "../../billing";
import { ConversationChatPane } from "../components/ConversationChatPane.tsx";
import { useConversations } from "../hooks/useConversations.ts";

export function ConversationsScreen() {
  const palette = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    conversations,
    selected,
    selectedId,
    status,
    error,
    select,
    create,
    rename,
    remove,
    refresh,
  } = useConversations();
  const [actionConversation, setActionConversation] = useState<Conversation | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const closeActions = () => {
    setActionConversation(null);
    setRenaming(false);
    setRenameTitle("");
  };

  const openActions = (conversation: Conversation) => {
    setActionConversation(conversation);
    setRenameTitle(conversation.title);
    setRenaming(false);
  };

  if (selected) {
    return (
      <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
        <ConversationChatPane
          key={selected.id}
          conversation={selected}
          onActivity={() => void refresh()}
          onClear={() => void refresh()}
          onClose={() => select(null)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.bg, paddingTop: insets.top + 12 }]}>
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <Text style={[styles.wordmark, { color: palette.fg }]}>baindar</Text>
          <PlanBadge />
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New conversation"
            style={[styles.iconButton, { backgroundColor: palette.action }]}
            onPress={() => void create()}
          >
            <Icons.Plus size={16} color={palette.actionFg} />
          </Pressable>
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={[styles.kicker, { color: palette.fgMuted }]}>
          {conversations.length} CONVERSATIONS
        </Text>
        <Text style={[styles.title, { color: palette.fg }]}>Conversations</Text>
      </View>

      <View style={styles.filters}>
        <Filter active>All · {conversations.length}</Filter>
        <Filter>Passage · {conversations.filter((item) => item.primaryDocId).length}</Filter>
        <Filter>Binder · {conversations.filter((item) => !item.primaryDocId).length}</Filter>
      </View>

      {error && <Text style={[styles.error, { color: palette.fg }]}>{error}</Text>}

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        {status === "loading" ? (
          <ConversationSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyList onCreate={() => void create()} />
        ) : (
          conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === selectedId}
              onPress={() => {
                closeActions();
                select(conversation.id);
              }}
              onMore={() => openActions(conversation)}
            />
          ))
        )}
      </ScrollView>

      <Modal
        transparent
        visible={actionConversation !== null}
        animationType="fade"
        onRequestClose={closeActions}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeActions}>
          <Pressable
            style={[
              styles.actionSheet,
              { backgroundColor: palette.bg, borderColor: palette.border },
            ]}
          >
            {actionConversation && renaming ? (
              <>
                <Text style={[styles.actionTitle, { color: palette.fg }]}>Rename conversation</Text>
                <TextInput
                  value={renameTitle}
                  onChangeText={setRenameTitle}
                  autoFocus
                  selectTextOnFocus
                  style={[
                    styles.renameInput,
                    {
                      borderColor: palette.border,
                      color: palette.fg,
                    },
                  ]}
                />
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.sheetButton, { borderColor: palette.border }]}
                    onPress={() => setRenaming(false)}
                  >
                    <Text style={[styles.sheetButtonText, { color: palette.fgSubtle }]}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.sheetButton, { backgroundColor: palette.action }]}
                    onPress={() => {
                      const title = renameTitle.trim();
                      if (title) void rename(actionConversation.id, title);
                      closeActions();
                    }}
                  >
                    <Text style={[styles.sheetButtonText, { color: palette.actionFg }]}>Save</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.actionTitle, { color: palette.fg }]}>
                  {actionConversation?.title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={styles.sheetOption}
                  onPress={() => setRenaming(true)}
                >
                  <Text style={[styles.sheetOptionText, { color: palette.fg }]}>Rename</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.sheetOption}
                  onPress={() => {
                    if (actionConversation) void remove(actionConversation.id);
                    closeActions();
                  }}
                >
                  <Text style={[styles.sheetOptionText, { color: color.status.error }]}>
                    Delete
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ConversationRow({
  conversation,
  active,
  onPress,
  onMore,
}: {
  conversation: Conversation;
  active: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  return (
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
      onPress={onPress}
      onMore={onMore}
    />
  );
}

function Filter({ active, children }: { active?: boolean; children: ReactNode }) {
  const palette = useThemeColors();
  return (
    <View
      style={[
        styles.filter,
        {
          backgroundColor: active ? palette.action : "transparent",
          borderColor: active ? palette.action : palette.border,
        },
      ]}
    >
      <Text style={[styles.filterText, { color: active ? palette.actionFg : palette.fgSubtle }]}>
        {children}
      </Text>
    </View>
  );
}

function ConversationSkeleton() {
  return (
    <View style={{ gap: 18 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 12 }}>
          <Skeleton shape="circle" width={30} height={30} />
          <View style={{ flex: 1 }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="42%" height={12} style={{ marginTop: 7 }} />
            <Skeleton width="86%" height={12} style={{ marginTop: 9 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyList({ onCreate }: { onCreate: () => void }) {
  const palette = useThemeColors();
  return (
    <View style={styles.empty}>
      <Icons.Sparkles size={28} color={palette.accent} />
      <Text style={[styles.emptyText, { color: palette.fgSubtle }]}>No conversations yet.</Text>
      <Pressable
        accessibilityRole="button"
        style={[styles.emptyButton, { backgroundColor: palette.action }]}
        onPress={onCreate}
      >
        <Text style={[styles.emptyButtonText, { color: palette.actionFg }]}>New conversation</Text>
      </Pressable>
    </View>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wordmark: {
    fontFamily: font.nativeFamily.display,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  heading: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  kicker: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.44,
  },
  title: {
    marginTop: 4,
    fontFamily: font.nativeFamily.display,
    fontSize: 28,
    fontWeight: "400",
    lineHeight: 30,
  },
  filters: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  filter: {
    height: 26,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  filterText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 11,
    fontWeight: "600",
  },
  list: {
    flex: 1,
    paddingHorizontal: 24,
  },
  error: {
    marginHorizontal: 24,
    marginBottom: 8,
    borderRadius: 10,
    padding: 12,
    fontFamily: font.nativeFamily.ui,
    fontSize: 13,
  },
  empty: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  emptyText: {
    fontFamily: font.nativeFamily.reading,
    fontSize: 18,
    lineHeight: 27,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: font.nativeFamily.display,
    fontSize: 22,
    fontWeight: "500",
    textAlign: "center",
  },
  emptyBody: {
    maxWidth: 320,
    fontFamily: font.nativeFamily.reading,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  emptyButton: {
    height: 36,
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  emptyButtonText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 13,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
    padding: 16,
  },
  actionSheet: {
    gap: 8,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  actionTitle: {
    marginBottom: 4,
    fontFamily: font.nativeFamily.display,
    fontSize: 18,
    fontWeight: "500",
  },
  sheetOption: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  sheetOptionText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 15,
    fontWeight: "600",
  },
  renameInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontFamily: font.nativeFamily.ui,
    fontSize: 15,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  sheetButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 999,
  },
  sheetButtonText: {
    fontFamily: font.nativeFamily.ui,
    fontSize: 13,
    fontWeight: "700",
  },
});
