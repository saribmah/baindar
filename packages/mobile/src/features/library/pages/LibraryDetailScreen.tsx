import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Chip,
  ChipButton,
  Icons,
  Sheet,
  Skeleton,
  color,
  font,
  radius,
  useThemeColors,
  useThemedStyles,
  type ThemeColors,
} from "@baindar/ui";
import type { Document, DocumentManifest, Highlight, Note } from "@baindar/sdk";
import { useSdk } from "../../../sdk/sdk.provider";
import { HIGHLIGHT_COLOR, KIND_LABEL } from "../constants";
import { LibraryCover } from "../components/LibraryCover";
import { buildLibraryStyles, type LibraryStyles } from "../library.styles";
import {
  estimateMinutes,
  formatWordCount,
  progressPercent,
  sectionOrderFromKey,
  sourceLabel,
} from "../utils/document";

type DetailTab = "contents" | "notes" | "highlights";
type NoteFilter = "all" | "attached" | "standalone";
type ReaderNoteParams = {
  id: string;
  chapter?: string;
  highlight?: string;
  note: string;
  target: string;
};
type ReaderHighlightParams = {
  id: string;
  chapter?: string;
  highlight: string;
  target: string;
};

export function LibraryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSdk();
  const styles = useThemedStyles(buildLibraryStyles);
  const detailNoteStyles = useThemedStyles(buildDetailNoteStyles);
  const palette = useThemeColors();
  const [doc, setDoc] = useState<Document | null>(null);
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("contents");
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      client.document.get({ id }),
      client.document.getManifest({ id }),
      client.highlight.list({ documentId: id }),
      client.note.list({ documentId: id }),
    ])
      .then(([docRes, manifestRes, highlightRes, noteRes]) => {
        if (cancelled) return;
        if (!docRes.data) {
          setError("Document not found");
          return;
        }
        setDoc(docRes.data);
        setManifest(manifestRes.data ?? null);
        setHighlights(highlightRes.data?.items ?? []);
        setNotes(noteRes.data?.items ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, id]);

  const currentOrder = sectionOrderFromKey(doc?.progress?.sectionKey) ?? 0;
  const pct = doc ? progressPercent(doc) : 0;
  const openReader = useCallback(() => {
    if (doc) router.push(`/read/${doc.id}`);
  }, [doc, router]);
  const openSection = useCallback(
    (order: number) => {
      if (!doc) return;
      router.push({ pathname: "/read/[id]", params: { id: doc.id, chapter: String(order) } });
    },
    [doc, router],
  );
  const openHighlight = useCallback(
    (highlight: Highlight) => {
      if (!doc) return;
      router.push({
        pathname: "/read/[id]",
        params: readerHighlightParams(doc.id, highlight),
      });
    },
    [doc, router],
  );
  const openNoteInReader = useCallback(
    (note: Note & { highlight?: Highlight }) => {
      if (!doc) return;
      router.push({ pathname: "/read/[id]", params: readerNoteParams(doc.id, note) });
    },
    [doc, router],
  );
  const highlightsById = useMemo(() => {
    const map = new Map<string, Highlight>();
    for (const highlight of highlights) map.set(highlight.id, highlight);
    return map;
  }, [highlights]);
  const notesWithHighlights = useMemo(
    () =>
      notes.map((note) => ({
        ...note,
        highlight: note.highlightId ? highlightsById.get(note.highlightId) : undefined,
      })),
    [highlightsById, notes],
  );
  const noteCounts = useMemo(
    () => ({
      all: notes.length,
      attached: notes.filter((note) => note.highlightId).length,
      standalone: notes.filter((note) => !note.highlightId).length,
    }),
    [notes],
  );
  const visibleNotes = useMemo(() => {
    if (noteFilter === "attached") return notesWithHighlights.filter((note) => note.highlightId);
    if (noteFilter === "standalone") return notesWithHighlights.filter((note) => !note.highlightId);
    return notesWithHighlights;
  }, [noteFilter, notesWithHighlights]);

  const createStandaloneNote = useCallback(async () => {
    if (!doc) return;
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      const res = await client.note.create({ documentId: doc.id, body: trimmed });
      if (res.data) {
        setNotes((prev) => [res.data, ...prev]);
        setNoteDraft("");
        setActiveTab("notes");
      }
    } finally {
      setSavingNote(false);
    }
  }, [client, doc, noteDraft]);

  const saveEditedNote = useCallback(
    async (body: string) => {
      if (!editingNote) return;
      const res = await client.note.update({ id: editingNote.id, body });
      if (res.data) {
        setNotes((prev) => prev.map((note) => (note.id === res.data.id ? res.data : note)));
      }
      setEditingNote(null);
    },
    [client, editingNote],
  );

  const deleteEditedNote = useCallback(async () => {
    if (!editingNote) return;
    const idToDelete = editingNote.id;
    await client.note.delete({ id: idToDelete });
    setNotes((prev) => prev.filter((note) => note.id !== idToDelete));
    setEditingNote(null);
  }, [client, editingNote]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            style={styles.iconButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/library"))}
          >
            <Icons.Back size={16} color={palette.fg} />
          </Pressable>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {!doc ? (
          <DetailSkeleton />
        ) : (
          <>
            <View style={styles.detailHero}>
              <LibraryCover doc={doc} width={140} height={212} />
            </View>
            <View style={styles.detailTitleWrap}>
              <Text style={styles.eyebrow}>
                {KIND_LABEL[doc.kind]} · {manifest ? formatWordCount(manifest.wordCount) : "EPUB"}
              </Text>
              <Text style={styles.detailTitle}>{doc.title}</Text>
              <Text style={styles.detailAuthor}>{sourceLabel(doc, manifest)}</Text>
            </View>

            <View style={styles.buttonRow}>
              <Button fullWidth style={{ flex: 1 }} onPress={openReader}>
                {`Continue · ${pct}%`}
              </Button>
              <Pressable accessibilityRole="button" style={styles.iconButton} onPress={openReader}>
                <Icons.Sparkles size={16} color={palette.accent} />
              </Pressable>
            </View>

            <View style={styles.tabStrip}>
              {[
                { key: "contents", label: "Contents", count: manifest?.sections.length ?? 0 },
                { key: "notes", label: "Notes", count: notes.length },
                { key: "highlights", label: "Highlights", count: highlights.length },
              ].map((tab) => (
                <ChipButton
                  key={tab.key}
                  variant={activeTab === tab.key ? "active" : "filled"}
                  onPress={() => setActiveTab(tab.key as DetailTab)}
                >
                  {`${tab.label} · ${tab.count}`}
                </ChipButton>
              ))}
            </View>

            {activeTab === "notes" ? (
              <NotesTab
                notes={visibleNotes}
                noteFilter={noteFilter}
                noteCounts={noteCounts}
                draft={noteDraft}
                saving={savingNote}
                styles={styles}
                detailNoteStyles={detailNoteStyles}
                palette={palette}
                onDraftChange={setNoteDraft}
                onFilterChange={setNoteFilter}
                onSave={createStandaloneNote}
                onEdit={setEditingNote}
                onOpenReader={openNoteInReader}
              />
            ) : activeTab === "highlights" ? (
              <HighlightsTab
                highlights={highlights}
                styles={styles}
                emptyTitle="No highlights yet"
                emptyText="Marked passages will collect here."
                onOpen={openHighlight}
              />
            ) : manifest ? (
              manifest.sections.map((section) => {
                const current = section.order === currentOrder;
                const read = section.order < currentOrder;
                return (
                  <Pressable
                    key={section.sectionKey}
                    accessibilityRole="button"
                    style={[styles.sectionRow, current ? styles.sectionRowCurrent : null]}
                    onPress={() => openSection(section.order)}
                  >
                    <Text style={styles.sectionNum}>
                      {String(section.order + 1).padStart(2, "0")}
                    </Text>
                    <View style={styles.sectionBody}>
                      <Text style={styles.sectionTitle} numberOfLines={2}>
                        {section.title || `Section ${section.order + 1}`}
                      </Text>
                      <Text style={styles.sectionMeta}>{estimateMinutes(section)}</Text>
                    </View>
                    {read && <Icons.Check size={14} color={color.status.success} />}
                    {current && <Icons.Chevron size={14} color={palette.fgSubtle} />}
                  </Pressable>
                );
              })
            ) : (
              <Skeleton height={260} />
            )}
          </>
        )}
      </ScrollView>
      <EditNoteSheet
        visible={editingNote !== null}
        note={editingNote}
        palette={palette}
        onClose={() => setEditingNote(null)}
        onSave={saveEditedNote}
        onDelete={deleteEditedNote}
      />
    </View>
  );
}

function NotesTab({
  notes,
  noteFilter,
  noteCounts,
  draft,
  saving,
  styles,
  detailNoteStyles,
  palette,
  onDraftChange,
  onFilterChange,
  onSave,
  onEdit,
  onOpenReader,
}: {
  notes: Array<Note & { highlight?: Highlight }>;
  noteFilter: NoteFilter;
  noteCounts: Record<NoteFilter, number>;
  draft: string;
  saving: boolean;
  styles: LibraryStyles;
  detailNoteStyles: DetailNoteStyles;
  palette: ThemeColors;
  onDraftChange: (value: string) => void;
  onFilterChange: (filter: NoteFilter) => void;
  onSave: () => void;
  onEdit: (note: Note) => void;
  onOpenReader: (note: Note & { highlight?: Highlight }) => void;
}) {
  return (
    <View>
      <View style={detailNoteStyles.composer}>
        <View style={detailNoteStyles.composerIcon}>
          <Icons.Note size={14} color={palette.fgSubtle} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={draft}
            multiline
            placeholder="A thought about this book..."
            placeholderTextColor={palette.fgMuted}
            style={detailNoteStyles.composerInput}
            onChangeText={onDraftChange}
          />
          <View style={detailNoteStyles.composerFooter}>
            <Chip variant="outline">Whole book</Chip>
            <View style={{ flex: 1 }} />
            <Button size="sm" disabled={saving || !draft.trim()} onPress={onSave}>
              Save
            </Button>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {[
          ["all", "All"],
          ["attached", "Attached"],
          ["standalone", "Standalone"],
        ].map(([value, label]) => (
          <ChipButton
            key={value}
            variant={noteFilter === value ? "active" : "outline"}
            onPress={() => onFilterChange(value as NoteFilter)}
          >
            {label} · {noteCounts[value as NoteFilter]}
          </ChipButton>
        ))}
      </ScrollView>

      {notes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No notes in this view</Text>
          <Text style={styles.emptyText}>
            Standalone thoughts and highlighted notes collect here.
          </Text>
        </View>
      ) : (
        notes.map((note) => (
          <DetailNoteItem
            key={note.id}
            note={note}
            detailNoteStyles={detailNoteStyles}
            palette={palette}
            onEdit={() => onEdit(note)}
            onOpen={() => onOpenReader(note)}
            onAsk={() => onOpenReader(note)}
          />
        ))
      )}
    </View>
  );
}

function readerNoteParams(
  documentId: string,
  note: Note & { highlight?: Highlight },
): ReaderNoteParams {
  const sectionKey = note.sectionKey ?? note.highlight?.sectionKey ?? null;
  const order = sectionKey ? sectionOrderFromKey(sectionKey) : null;
  return {
    id: documentId,
    ...(order !== null ? { chapter: String(order) } : {}),
    ...(note.highlight ? { highlight: note.highlight.id } : {}),
    note: note.id,
    target: "1",
  };
}

function readerHighlightParams(documentId: string, highlight: Highlight): ReaderHighlightParams {
  const order = sectionOrderFromKey(highlight.sectionKey);
  return {
    id: documentId,
    ...(order !== null ? { chapter: String(order) } : {}),
    highlight: highlight.id,
    target: "1",
  };
}

function HighlightsTab({
  highlights,
  styles,
  emptyTitle,
  emptyText,
  onOpen,
}: {
  highlights: Highlight[];
  styles: LibraryStyles;
  emptyTitle: string;
  emptyText: string;
  onOpen: (highlight: Highlight) => void;
}) {
  if (highlights.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View>
      {highlights.map((highlight) => (
        <Pressable
          key={highlight.id}
          accessibilityRole="button"
          style={styles.highlightItem}
          onPress={() => onOpen(highlight)}
        >
          <View style={styles.highlightMeta}>
            <View
              style={[styles.highlightDot, { backgroundColor: HIGHLIGHT_COLOR[highlight.color] }]}
            />
            <Text style={styles.highlightDate}>
              {new Date(highlight.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={[styles.quote, { borderLeftColor: HIGHLIGHT_COLOR[highlight.color] }]}>
            {`"${highlight.textSnippet}"`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function DetailNoteItem({
  note,
  detailNoteStyles,
  palette,
  onEdit,
  onOpen,
  onAsk,
}: {
  note: Note & { highlight?: Highlight };
  detailNoteStyles: DetailNoteStyles;
  palette: ThemeColors;
  onEdit: () => void;
  onOpen: () => void;
  onAsk: () => void;
}) {
  const attached = Boolean(note.highlight);
  const accent = note.highlight ? HIGHLIGHT_COLOR[note.highlight.color] : palette.fgMuted;
  return (
    <View style={detailNoteStyles.item}>
      <View style={detailNoteStyles.meta}>
        {attached ? (
          <View style={[detailNoteStyles.dot, { backgroundColor: accent }]} />
        ) : (
          <Icons.Note size={13} color={palette.fgMuted} />
        )}
        <Text style={detailNoteStyles.metaText}>{noteLocationLabel(note, note.highlight)}</Text>
        <Text style={detailNoteStyles.date}>{formatDate(note.createdAt)}</Text>
      </View>
      {note.highlight && (
        <Text style={[detailNoteStyles.quote, { borderLeftColor: accent }]} numberOfLines={3}>
          {`“${note.highlight.textSnippet}”`}
        </Text>
      )}
      <View style={[detailNoteStyles.noteBox, attached ? detailNoteStyles.noteBoxAttached : null]}>
        <Icons.Note size={13} color={palette.fgSubtle} />
        <Text style={detailNoteStyles.noteText}>{note.body}</Text>
      </View>
      <View style={[detailNoteStyles.actions, attached ? detailNoteStyles.actionsAttached : null]}>
        <Pressable accessibilityRole="button" onPress={onEdit}>
          <Text style={detailNoteStyles.action}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpen}>
          <Text style={detailNoteStyles.action}>
            {attached ? "Open in book" : "Attach to passage"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onAsk}>
          <Text style={detailNoteStyles.actionAsk}>Ask Baindar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function noteLocationLabel(note: Note, highlight?: Highlight): string {
  const sectionKey = note.sectionKey ?? highlight?.sectionKey ?? null;
  if (!sectionKey) return "Whole book";
  const match = /:(\d+)$/.exec(sectionKey);
  return match ? `Ch. ${Number(match[1]) + 1}` : "Section note";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const buildDetailNoteStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    composer: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderRadius: 16,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
    },
    composerIcon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.pill,
      backgroundColor: palette.border,
    },
    composerInput: {
      minHeight: 46,
      padding: 0,
      fontFamily: font.nativeFamily.reading,
      fontSize: 15,
      lineHeight: 22,
      color: palette.fg,
      textAlignVertical: "top",
    },
    composerFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    item: {
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingVertical: 14,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radius.pill,
    },
    metaText: {
      flex: 1,
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      fontWeight: "600",
      color: palette.fg,
    },
    date: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      color: palette.fgMuted,
    },
    quote: {
      marginLeft: 18,
      borderLeftWidth: 2,
      paddingLeft: 12,
      fontFamily: font.nativeFamily.reading,
      fontSize: 13,
      fontStyle: "italic",
      lineHeight: 20,
      color: palette.fg,
    },
    noteBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderRadius: 12,
      backgroundColor: palette.surfaceRaised,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noteBoxAttached: {
      marginLeft: 18,
    },
    noteText: {
      flex: 1,
      fontFamily: font.nativeFamily.reading,
      fontSize: 13,
      lineHeight: 20,
      color: palette.fg,
    },
    actions: {
      flexDirection: "row",
      gap: 14,
      marginTop: 4,
    },
    actionsAttached: {
      marginLeft: 18,
    },
    action: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      color: palette.fgMuted,
    },
    actionAsk: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 12,
      fontWeight: "600",
      color: palette.accent,
    },
  });

type DetailNoteStyles = ReturnType<typeof buildDetailNoteStyles>;

function EditNoteSheet({
  visible,
  note,
  palette,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  note: Note | null;
  palette: ThemeColors;
  onClose: () => void;
  onSave: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const styles = useThemedStyles(buildEditNoteStyles);
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBody(note?.body ?? "");
  }, [note, visible]);

  const handleClose = () => {
    setBody("");
    onClose();
  };

  const handleSave = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setWorking(true);
    try {
      await onSave(trimmed);
      setBody("");
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    setWorking(true);
    try {
      await onDelete();
      setBody("");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={handleClose} style={styles.sheet}>
      <Text style={styles.eyebrow}>Edit note</Text>
      <Text style={styles.title}>Keep the thought clear.</Text>
      <TextInput
        value={body}
        multiline
        placeholder="What did you think?"
        placeholderTextColor={palette.fgMuted}
        style={styles.input}
        onChangeText={setBody}
      />
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          disabled={working}
          style={styles.deleteButton}
          onPress={handleDelete}
        >
          Delete
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={working}
          style={{ flex: 1 }}
          onPress={handleClose}
        >
          Cancel
        </Button>
        <Button disabled={working || !body.trim()} style={{ flex: 2 }} onPress={handleSave}>
          Save note
        </Button>
      </View>
    </Sheet>
  );
}

const buildEditNoteStyles = (palette: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      paddingHorizontal: 24,
    },
    eyebrow: {
      fontFamily: font.nativeFamily.ui,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.44,
      textTransform: "uppercase",
      color: palette.fgMuted,
    },
    title: {
      fontFamily: font.nativeFamily.display,
      fontSize: 24,
      fontWeight: "400",
      lineHeight: 28,
      color: palette.fg,
    },
    input: {
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
    actions: {
      flexDirection: "row",
      gap: 8,
    },
    deleteButton: {
      flex: 1,
    },
  });

function DetailSkeleton() {
  return (
    <View>
      <Skeleton width={140} height={212} style={{ alignSelf: "center", marginTop: 20 }} />
      <Skeleton width="70%" height={28} style={{ alignSelf: "center", marginTop: 20 }} />
      <Skeleton width="50%" height={14} style={{ alignSelf: "center", marginTop: 10 }} />
      <Skeleton height={260} style={{ marginTop: 24 }} />
    </View>
  );
}
