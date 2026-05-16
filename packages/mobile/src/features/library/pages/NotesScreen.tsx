import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  ChipButton,
  Icons,
  Sheet,
  Skeleton,
  Wordmark,
  font,
  radius,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from "@baindar/ui";
import type { Document, Highlight, Note } from "@baindar/sdk";
import { useSdk } from "../../../sdk/sdk.provider";
import { PlanBadge } from "../../billing";
import { HIGHLIGHT_COLOR } from "../constants";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryHighlights } from "../hooks/useLibraryHighlights";
import { useLibraryNotes, type LibraryNote } from "../hooks/useLibraryNotes";
import { buildLibraryStyles } from "../library.styles";

type NoteFilter = "all" | "attached" | "standalone";
type EditorState = Note | "new" | null;
type EnrichedNote = LibraryNote & { highlight?: Highlight };
type ReaderNoteParams = {
  id: string;
  ask?: string;
  chapter?: string;
  highlight?: string;
  note: string;
  target: string;
};

const filters: Array<{ value: NoteFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "attached", label: "Attached" },
  { value: "standalone", label: "Standalone" },
];

export function NotesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { client } = useSdk();
  const library = useThemedStyles(buildLibraryStyles);
  const styles = useThemedStyles(buildNotesScreenStyles);
  const palette = useThemeColors();
  const { documents } = useLibraryDocuments();
  const { highlights } = useLibraryHighlights(documents);
  const { notes, error, refresh } = useLibraryNotes(documents);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editor, setEditor] = useState<EditorState>(null);

  const highlightsById = useMemo(() => {
    const map = new Map<string, Highlight>();
    for (const item of highlights ?? []) map.set(item.id, item);
    return map;
  }, [highlights]);

  const enriched = useMemo(() => {
    if (!notes) return null;
    return notes.map((note) => ({
      ...note,
      highlight: note.highlightId ? highlightsById.get(note.highlightId) : undefined,
    }));
  }, [highlightsById, notes]);

  const counts = useMemo(() => {
    const items = enriched ?? [];
    return {
      all: items.length,
      attached: items.filter((note) => note.highlightId).length,
      standalone: items.filter((note) => !note.highlightId).length,
    };
  }, [enriched]);

  const visible = useMemo(() => {
    if (!enriched) return null;
    if (filter === "attached") return enriched.filter((note) => note.highlightId);
    if (filter === "standalone") return enriched.filter((note) => !note.highlightId);
    return enriched;
  }, [enriched, filter]);

  const sourceCount = useMemo(() => {
    const ids = new Set<string>();
    for (const note of notes ?? []) ids.add(note.documentId);
    return ids.size;
  }, [notes]);

  const readyDocuments = useMemo(
    () => (documents ?? []).filter((doc) => doc.status === "processed"),
    [documents],
  );

  const saveNote = async (documentId: string, body: string) => {
    const trimmed = body.trim();
    if (!trimmed || !documentId) return;
    if (editor && editor !== "new") {
      await client.note.update({ id: editor.id, body: trimmed });
    } else {
      await client.note.create({ documentId, body: trimmed });
    }
    setEditor(null);
    await refresh();
  };

  const deleteNote = async () => {
    if (!editor || editor === "new") return;
    await client.note.delete({ id: editor.id });
    setEditor(null);
    await refresh();
  };

  return (
    <View style={library.root}>
      <ScrollView
        style={library.scroll}
        contentContainerStyle={[
          library.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
      >
        <View style={library.header}>
          <View style={library.brandRow}>
            <Wordmark size="sm" />
            <PlanBadge />
          </View>
        </View>

        <View style={library.titleBlock}>
          <Text style={library.eyebrow}>
            {counts.all} notes · {sourceCount} sources
          </Text>
          <Text style={library.title}>Notes</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={library.chipRow}
        >
          {filters.map((item) => (
            <ChipButton
              key={item.value}
              variant={filter === item.value ? "active" : "outline"}
              onPress={() => setFilter(item.value)}
            >
              {item.label} · {counts[item.value]}
            </ChipButton>
          ))}
        </ScrollView>

        {error && <Text style={library.error}>{error}</Text>}
        {!visible ? (
          <NotesSkeleton styles={styles} />
        ) : visible.length === 0 ? (
          <View style={library.empty}>
            <Text style={library.emptyTitle}>No notes yet</Text>
            <Text style={library.emptyText}>
              Standalone thoughts and highlighted notes collect here.
            </Text>
          </View>
        ) : (
          visible.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              styles={styles}
              palette={palette}
              onPress={() => setEditor(note)}
              onOpen={() => router.push({ pathname: "/read/[id]", params: readerNoteParams(note) })}
              onAsk={() =>
                router.push({ pathname: "/read/[id]", params: readerNoteParams(note, true) })
              }
            />
          ))
        )}
      </ScrollView>

      <NoteEditorSheet
        visible={editor !== null}
        note={editor && editor !== "new" ? editor : null}
        documents={readyDocuments}
        styles={styles}
        palette={palette}
        onClose={() => setEditor(null)}
        onSave={saveNote}
        onDelete={editor && editor !== "new" ? deleteNote : undefined}
      />
    </View>
  );
}

function readerNoteParams(note: EnrichedNote, ask = false): ReaderNoteParams {
  const sectionKey = note.sectionKey ?? note.highlight?.sectionKey ?? null;
  const order = sectionKey ? sectionOrderFromKey(sectionKey) : null;
  return {
    id: note.document.id,
    ...(ask ? { ask: "note" } : {}),
    ...(order !== null ? { chapter: String(order) } : {}),
    ...(note.highlight ? { highlight: note.highlight.id } : {}),
    note: note.id,
    target: "1",
  };
}

function sectionOrderFromKey(sectionKey: string): number | null {
  const match = /:(\d+)$/.exec(sectionKey);
  return match ? Number(match[1]) : null;
}

function NoteItem({
  note,
  styles,
  palette,
  onPress,
  onOpen,
  onAsk,
}: {
  note: EnrichedNote;
  styles: NotesScreenStyles;
  palette: ThemeColors;
  onPress: () => void;
  onOpen: () => void;
  onAsk: () => void;
}) {
  const attached = Boolean(note.highlight);
  const accent = note.highlight ? HIGHLIGHT_COLOR[note.highlight.color] : palette.fgMuted;
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.noteItem, pressed ? styles.pressed : null]}
      onPress={onPress}
    >
      <View style={styles.noteMeta}>
        {attached ? (
          <View style={[styles.noteDot, { backgroundColor: accent }]} />
        ) : (
          <Icons.Note size={13} color={palette.fgMuted} />
        )}
        <Text style={styles.noteSource} numberOfLines={1}>
          {note.document.title}
        </Text>
        <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
      </View>

      {note.highlight && (
        <Text style={[styles.noteQuote, { borderLeftColor: accent }]} numberOfLines={3}>
          {`“${note.highlight.textSnippet}”`}
        </Text>
      )}

      <View style={[styles.noteBody, attached ? styles.noteBodyAttached : null]}>
        <Icons.Note size={13} color={palette.fgSubtle} />
        <Text style={styles.noteBodyText}>{note.body}</Text>
      </View>

      <View style={[styles.noteActions, attached ? styles.noteActionsAttached : null]}>
        <Text style={styles.noteAction}>Edit</Text>
        <Pressable accessibilityRole="button" onPress={onOpen}>
          <Text style={styles.noteAction}>{attached ? "Open in book" : "Attach to passage"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onAsk}>
          <Text style={styles.noteAsk}>Ask Baindar</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function NoteEditorSheet({
  visible,
  note,
  documents,
  styles,
  palette,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  note: Note | null;
  documents: ReadonlyArray<Document>;
  styles: NotesScreenStyles;
  palette: ThemeColors;
  onClose: () => void;
  onSave: (documentId: string, body: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [documentId, setDocumentId] = useState("");
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDocumentId(note?.documentId ?? documents[0]?.id ?? "");
    setBody(note?.body ?? "");
  }, [documents, note, visible]);

  const handleClose = () => {
    setDocumentId("");
    setBody("");
    onClose();
  };

  const handleSave = async () => {
    setWorking(true);
    try {
      await onSave(documentId, body);
      setDocumentId("");
      setBody("");
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setWorking(true);
    try {
      await onDelete();
      setDocumentId("");
      setBody("");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={handleClose} style={styles.sheet}>
      <Text style={styles.sheetEyebrow}>{note ? "Edit note" : "New note"}</Text>
      <Text style={styles.sheetTitle}>
        {note ? "Keep the thought clear." : "Capture a thought."}
      </Text>

      {!note && documents.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sourceRow}
        >
          {documents.map((doc) => (
            <ChipButton
              key={doc.id}
              variant={documentId === doc.id ? "active" : "outline"}
              onPress={() => setDocumentId(doc.id)}
            >
              {doc.title}
            </ChipButton>
          ))}
        </ScrollView>
      )}

      <TextInput
        value={body}
        multiline
        placeholder="What did you think?"
        placeholderTextColor={palette.fgMuted}
        style={styles.noteInput}
        onChangeText={setBody}
      />

      <View style={styles.sheetActions}>
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            disabled={working}
            style={styles.deleteButton}
            onPress={handleDelete}
          >
            Delete
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={working}
          style={{ flex: 1 }}
          onPress={handleClose}
        >
          Cancel
        </Button>
        <Button
          disabled={working || !documentId || !body.trim()}
          style={{ flex: 2 }}
          onPress={handleSave}
        >
          Save note
        </Button>
      </View>
    </Sheet>
  );
}

function NotesSkeleton({ styles }: { styles: NotesScreenStyles }) {
  return (
    <View>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.noteItem}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="95%" height={42} />
          <Skeleton width="75%" height={44} />
        </View>
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const buildNotesScreenStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    pressed: {
      opacity: 0.72,
    },
    noteItem: {
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingVertical: 14,
    },
    noteMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noteDot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
    },
    noteSource: {
      flex: 1,
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      fontWeight: "600",
      color: palette.fg,
    },
    noteDate: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      color: palette.fgMuted,
    },
    noteQuote: {
      marginLeft: 18,
      borderLeftWidth: 2,
      paddingLeft: 12,
      fontFamily: font.nativeFamily.reading,
      fontSize: 13,
      fontStyle: "italic",
      lineHeight: 20,
      color: palette.fg,
    },
    noteBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderRadius: 12,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteBodyAttached: {
      marginLeft: 18,
    },
    noteBodyText: {
      flex: 1,
      fontFamily: font.nativeFamily.reading,
      fontSize: 13,
      lineHeight: 20,
      color: palette.fg,
    },
    noteActions: {
      flexDirection: "row",
      gap: 12,
    },
    noteActionsAttached: {
      marginLeft: 18,
    },
    noteAction: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      color: palette.fgMuted,
    },
    noteAsk: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      fontWeight: "600",
      color: palette.accent,
    },
    sheet: {
      paddingHorizontal: 24,
    },
    sheetEyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.44,
      textTransform: "uppercase",
      color: palette.fgMuted,
    },
    sheetTitle: {
      fontFamily: font.nativeFamily.display,
      fontSize: 24,
      fontWeight: "400",
      lineHeight: 28,
      color: palette.fg,
    },
    sourceRow: {
      gap: 8,
      paddingVertical: 4,
    },
    noteInput: {
      minHeight: 132,
      borderWidth: 1.5,
      borderColor: palette.action,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: font.nativeFamily.reading,
      fontSize: 15,
      lineHeight: 23,
      color: palette.fg,
      textAlignVertical: "top",
    },
    sheetActions: {
      flexDirection: "row",
      gap: 8,
    },
    deleteButton: {
      flex: 1,
    },
  });

type NotesScreenStyles = ReturnType<typeof buildNotesScreenStyles>;
