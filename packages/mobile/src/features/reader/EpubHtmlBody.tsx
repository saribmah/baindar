import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  Button,
  IconButton,
  Icons,
  SelectionToolbar,
  Sheet,
  color,
  radius,
  themeColors,
  type HighlightColor,
  type Theme,
} from "@baindar/ui";
import type { Highlight, Note } from "@baindar/sdk";
import { useProfile } from "../profile";
import { buildEpubHtml } from "./buildEpubHtml.ts";
import { inlineEpubAssets, type AssetCache } from "./inlineAssets.ts";
import type { ReaderHighlights } from "./useReaderHighlights.ts";

type Rect = { top: number; left: number; width: number; height: number };

export type SelectionState = {
  rect: Rect;
  charRange: { start: number; end: number };
  text: string;
};

export type EpubHtmlBodyHandle = {
  copySelection: () => void;
  highlightSelection: (color?: HighlightColor) => void;
  askSelection: () => void;
  addNoteFromSelection: () => void;
  clearSelection: () => void;
};

type WebMessage =
  | { type: "ready" }
  | { type: "height"; value: number }
  | { type: "selection"; cleared: true }
  | { type: "selection"; rect: Rect; charRange: { start: number; end: number }; text: string }
  | { type: "tap-highlight"; id: string; rect: Rect }
  | { type: "target-highlight"; id: string; rect: Rect };

export type EpubHtmlBodyProps = {
  html: string;
  assetBase: string;
  theme: Theme;
  highlights: Highlight[];
  notesByHighlightId: ReadonlyMap<string, Note>;
  fontSize?: number;
  contentKey: string;
  authedFetch: typeof fetch;
  assetCache: AssetCache;
  onCreateHighlight: ReaderHighlights["create"];
  onUpdateColor: ReaderHighlights["updateColor"];
  onSetNote: ReaderHighlights["setNoteForHighlight"];
  onRemoveHighlight: ReaderHighlights["remove"];
  targetHighlightId?: string | null;
  targetRequestId?: string | null;
  onTargetHighlight?: (offsetY: number) => void;
  onAskSelection?: (quote: string) => void;
  onSelectionChange?: (selection: SelectionState | null) => void;
};

export const EpubHtmlBody = forwardRef<EpubHtmlBodyHandle, EpubHtmlBodyProps>(function EpubHtmlBody(
  {
    html,
    assetBase,
    theme,
    highlights,
    notesByHighlightId,
    fontSize = 17,
    contentKey,
    authedFetch,
    assetCache,
    onCreateHighlight,
    onUpdateColor,
    onSetNote,
    onRemoveHighlight,
    targetHighlightId,
    targetRequestId,
    onTargetHighlight,
    onAskSelection,
    onSelectionChange,
  },
  ref,
) {
  const palette = themeColors(theme);
  const { profile } = useProfile();
  const defaultColor: HighlightColor = profile?.defaultHighlightColor ?? "pink";
  const webRef = useRef<WebView>(null);
  const [height, setHeight] = useState(400);
  const [resolvedHtml, setResolvedHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [focused, setFocused] = useState<Highlight | null>(null);
  const [layoutY, setLayoutY] = useState(0);
  const [noteDraft, setNoteDraft] = useState<
    { kind: "new"; selection: SelectionState } | { kind: "edit"; highlight: Highlight } | null
  >(null);

  // Inline relative <img src> assets via the authed fetch so the WebView can
  // render them without a session cookie.
  useEffect(() => {
    let cancelled = false;
    setResolvedHtml(null);
    setReady(false);
    setSelection(null);
    setFocused(null);
    inlineEpubAssets(html, assetBase, authedFetch, assetCache)
      .then((out) => {
        if (!cancelled) setResolvedHtml(out);
      })
      .catch(() => {
        if (!cancelled) setResolvedHtml(html);
      });
    return () => {
      cancelled = true;
    };
  }, [html, assetBase, authedFetch, assetCache]);

  const wrapped = useMemo(() => {
    if (resolvedHtml === null) return null;
    return buildEpubHtml(resolvedHtml, palette.bg, palette.text, fontSize);
  }, [resolvedHtml, palette.bg, palette.text, fontSize]);

  // Push highlights into the WebView once it signals ready, and again whenever
  // the highlights array changes. The injected payload carries a derived
  // `hasNote` flag so the in-page wrapper can paint the note indicator
  // without a second round trip.
  useEffect(() => {
    if (!ready) return;
    const enriched = highlights.map((h) => ({ ...h, hasNote: notesByHighlightId.has(h.id) }));
    const json = JSON.stringify(enriched);
    webRef.current?.injectJavaScript(`window.bd_setHighlights(${json}); true;`);
  }, [ready, highlights, notesByHighlightId, contentKey]);

  useEffect(() => {
    if (!ready || !targetHighlightId) return;
    const id = JSON.stringify(targetHighlightId);
    webRef.current?.injectJavaScript(`
      window.bd_reportHighlightRect && window.bd_reportHighlightRect(${id});
      true;
    `);
  }, [ready, targetHighlightId, targetRequestId, highlights, notesByHighlightId]);

  const clearWebSelection = useCallback(() => {
    webRef.current?.injectJavaScript(
      `window.bd_clearSelection && window.bd_clearSelection(); true;`,
    );
    setSelection(null);
  }, []);

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: WebMessage;
      try {
        msg = JSON.parse(e.nativeEvent.data) as WebMessage;
      } catch {
        return;
      }
      if (msg.type === "height") {
        setHeight(Math.max(100, Math.ceil(msg.value)));
        return;
      }
      if (msg.type === "ready") {
        setReady(true);
        return;
      }
      if (msg.type === "selection") {
        if ("cleared" in msg) {
          setSelection(null);
        } else {
          setSelection({ rect: msg.rect, charRange: msg.charRange, text: msg.text });
        }
        return;
      }
      if (msg.type === "tap-highlight") {
        const hit = highlights.find((h) => h.id === msg.id);
        if (hit) {
          setSelection(null);
          setFocused(hit);
        }
        return;
      }
      if (msg.type === "target-highlight") {
        onTargetHighlight?.(layoutY + msg.rect.top);
        const hit = highlights.find((h) => h.id === msg.id);
        if (hit) setFocused(hit);
      }
    },
    [highlights, layoutY, onTargetHighlight],
  );

  const handleCopySelection = useCallback(() => {
    if (!selection) return;
    const json = JSON.stringify(selection.text);
    webRef.current?.injectJavaScript(`
      (function() {
        var value = ${json};
        function fallbackCopy() {
          var input = document.createElement('textarea');
          input.value = value;
          input.style.position = 'fixed';
          input.style.opacity = '0';
          document.body.appendChild(input);
          input.focus();
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).catch(fallbackCopy);
        } else {
          fallbackCopy();
        }
        window.bd_clearSelection && window.bd_clearSelection();
      })();
      true;
    `);
    setSelection(null);
  }, [selection]);

  const handleHighlightSelection = useCallback(
    async (c: HighlightColor) => {
      if (!selection) return;
      const captured = selection;
      clearWebSelection();
      await onCreateHighlight(c, {
        offsetStart: captured.charRange.start,
        offsetEnd: captured.charRange.end,
        text: captured.text,
      });
    },
    [selection, clearWebSelection, onCreateHighlight],
  );

  const handleAskSelection = useCallback(() => {
    if (!selection) return;
    const captured = selection.text;
    onAskSelection?.(captured);
    clearWebSelection();
  }, [selection, onAskSelection, clearWebSelection]);

  const handleAddNote = useCallback(() => {
    if (!selection) return;
    const captured = selection;
    clearWebSelection();
    void onCreateHighlight(defaultColor, {
      offsetStart: captured.charRange.start,
      offsetEnd: captured.charRange.end,
      text: captured.text,
    }).then((created) => {
      if (created) setNoteDraft({ kind: "edit", highlight: created });
    });
  }, [selection, clearWebSelection, onCreateHighlight, defaultColor]);

  useImperativeHandle(
    ref,
    () => ({
      copySelection: handleCopySelection,
      highlightSelection: (c?: HighlightColor) => {
        void handleHighlightSelection(c ?? defaultColor);
      },
      askSelection: handleAskSelection,
      addNoteFromSelection: handleAddNote,
      clearSelection: clearWebSelection,
    }),
    [
      handleCopySelection,
      handleHighlightSelection,
      handleAskSelection,
      handleAddNote,
      clearWebSelection,
      defaultColor,
    ],
  );

  const handleChangeFocusedColor = useCallback(
    async (c: HighlightColor) => {
      if (!focused) return;
      await onUpdateColor(focused.id, c);
      setFocused((curr) => (curr ? { ...curr, color: c } : curr));
    },
    [focused, onUpdateColor],
  );

  const handleEditFocusedNote = useCallback(() => {
    if (!focused) return;
    setNoteDraft({ kind: "edit", highlight: focused });
    setFocused(null);
  }, [focused]);

  const handleDeleteFocused = useCallback(async () => {
    if (!focused) return;
    const id = focused.id;
    setFocused(null);
    await onRemoveHighlight(id);
  }, [focused, onRemoveHighlight]);

  const handleSaveNote = useCallback(
    async (note: string) => {
      if (!noteDraft) return;
      const trimmed = note.trim();
      if (noteDraft.kind === "new") {
        await onCreateHighlight(
          defaultColor,
          {
            offsetStart: noteDraft.selection.charRange.start,
            offsetEnd: noteDraft.selection.charRange.end,
            text: noteDraft.selection.text,
          },
          trimmed.length > 0 ? trimmed : undefined,
        );
      } else {
        await onSetNote(noteDraft.highlight.id, trimmed.length > 0 ? trimmed : null);
      }
      setNoteDraft(null);
    },
    [noteDraft, onCreateHighlight, onSetNote, defaultColor],
  );

  if (!wrapped) {
    return <View style={{ height: 400 }} />;
  }

  return (
    <View
      style={{ position: "relative" }}
      onLayout={(event) => setLayoutY(event.nativeEvent.layout.y)}
    >
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: wrapped, baseUrl: assetBase }}
        style={{ height, width: "100%", backgroundColor: "transparent" }}
        scrollEnabled={false}
        onMessage={onMessage}
        showsVerticalScrollIndicator={false}
        androidLayerType="software"
      />

      <Sheet
        visible={focused !== null}
        onClose={() => setFocused(null)}
        style={{ backgroundColor: palette.surface }}
      >
        {focused && (
          <FocusedHighlightCard
            highlight={focused}
            noteBody={notesByHighlightId.get(focused.id)?.body ?? null}
            theme={theme}
            onChangeColor={handleChangeFocusedColor}
            onEditNote={handleEditFocusedNote}
            onAsk={() => {
              onAskSelection?.(focused.textSnippet);
              setFocused(null);
            }}
            onDelete={handleDeleteFocused}
            onClose={() => setFocused(null)}
          />
        )}
      </Sheet>

      <Sheet
        visible={noteDraft !== null}
        onClose={() => setNoteDraft(null)}
        style={{ backgroundColor: palette.surface }}
      >
        {noteDraft && (
          <NoteEditor
            theme={theme}
            initialNote={
              noteDraft.kind === "edit"
                ? (notesByHighlightId.get(noteDraft.highlight.id)?.body ?? "")
                : ""
            }
            quote={
              noteDraft.kind === "edit" ? noteDraft.highlight.textSnippet : noteDraft.selection.text
            }
            onCancel={() => setNoteDraft(null)}
            onAsk={() => {
              const quote =
                noteDraft.kind === "edit"
                  ? noteDraft.highlight.textSnippet
                  : noteDraft.selection.text;
              onAskSelection?.(quote);
              setNoteDraft(null);
            }}
            onSave={handleSaveNote}
          />
        )}
      </Sheet>
    </View>
  );
});

function FocusedHighlightCard({
  highlight,
  noteBody,
  theme,
  onChangeColor,
  onEditNote,
  onAsk,
  onDelete,
  onClose,
}: {
  highlight: Highlight;
  noteBody: string | null;
  theme: Theme;
  onChangeColor: (color: HighlightColor) => void;
  onEditNote: () => void;
  onAsk: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const palette = themeColors(theme);
  const muted = palette.fgMuted;
  return (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.viewerTitleRow}>
          <View
            style={[styles.viewerSwatch, { backgroundColor: color.highlight[highlight.color] }]}
          />
          {noteBody && <Icons.Note size={12} color={muted} />}
          <Text style={[styles.cardLabel, { color: palette.text }]}>
            {noteBody ? "Highlight + note" : "Highlight"}
          </Text>
        </View>
        <IconButton aria-label="Close" size="sm" onPress={onClose}>
          <Icons.Close size={14} color={palette.text} />
        </IconButton>
      </View>
      <Text style={[styles.cardQuote, { color: palette.text }]} numberOfLines={4}>
        {`“${highlight.textSnippet}”`}
      </Text>
      {noteBody && (
        <View style={[styles.notePreview, { backgroundColor: noteBgFor(theme) }]}>
          <Text style={{ color: palette.text }}>{noteBody}</Text>
        </View>
      )}
      <View style={styles.cardActionsRow}>
        <SelectionToolbar onPickColor={onChangeColor} />
      </View>
      <View style={styles.viewerFooter}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={noteBody ? "Edit note" : "Add note"}
          onPress={onEditNote}
          style={({ pressed }) => [styles.viewerPill, pressed && { opacity: 0.7 }]}
        >
          {noteBody ? (
            <Icons.Pencil size={13} color={palette.text} />
          ) : (
            <Icons.Note size={13} color={palette.text} />
          )}
          <Text style={[styles.viewerPillText, { color: palette.text }]}>
            {noteBody ? "Edit note" : "Add note"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask Baindar"
          onPress={onAsk}
          style={({ pressed }) => [styles.viewerPill, pressed && { opacity: 0.7 }]}
        >
          <Icons.Sparkles size={13} color={palette.accent} />
          <Text style={[styles.viewerPillText, { color: palette.accent }]}>Ask</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <IconButton aria-label="Delete highlight" size="sm" onPress={onDelete}>
          <Icons.Trash size={16} color={color.status.error} />
        </IconButton>
      </View>
    </>
  );
}

function NoteEditor({
  theme,
  initialNote,
  quote,
  onCancel,
  onAsk,
  onSave,
}: {
  theme: Theme;
  initialNote: string;
  quote: string;
  onCancel: () => void;
  onAsk: () => void;
  onSave: (note: string) => Promise<void>;
}) {
  const palette = themeColors(theme);
  const muted = palette.fgMuted;
  const [value, setValue] = useState(initialNote);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.viewerTitleRow}>
          <View style={[styles.viewerSwatch, { backgroundColor: color.highlight.pink }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardLabel, { color: palette.text }]}>Note on highlight</Text>
            <Text style={[styles.editorSubLabel, { color: muted }]}>Selected passage</Text>
          </View>
        </View>
        <IconButton aria-label="Close" size="sm" onPress={onCancel}>
          <Icons.Close size={14} color={palette.text} />
        </IconButton>
      </View>
      <View style={[styles.noteQuote, { borderLeftColor: color.highlight.pink }]}>
        <Text style={[styles.cardQuote, { color: palette.fgSubtle }]} numberOfLines={4}>
          {`“${quote}”`}
        </Text>
      </View>
      <TextInput
        autoFocus
        multiline
        placeholder="What did you think?"
        placeholderTextColor={muted}
        value={value}
        onChangeText={setValue}
        style={[
          styles.noteInput,
          { backgroundColor: noteBgFor(theme), color: palette.text, borderColor: palette.border },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Baindar about this"
        onPress={onAsk}
        style={[styles.askShortcut, { backgroundColor: noteBgFor(theme) }]}
      >
        <Icons.Sparkles size={14} color={palette.accent} />
        <Text style={[styles.askShortcutText, { color: palette.accent }]}>
          Ask Baindar about this
        </Text>
        <Icons.Chevron size={12} color={palette.accent} />
      </Pressable>
      <View style={styles.editorActions}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={({ pressed }) => [styles.editorCancel, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: palette.text }}>Cancel</Text>
        </Pressable>
        <Button
          variant="primary"
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await onSave(value);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving..." : "Save note"}
        </Button>
      </View>
    </>
  );
}

function noteBgFor(theme: Theme): string {
  if (theme === "dark") return color.night[800];
  if (theme === "sepia") return color.sepia[50];
  return color.paper[100];
}

export function floatingBgFor(theme: Theme): string {
  if (theme === "dark") return color.night[800];
  if (theme === "sepia") return color.sepia[50];
  return color.paper[50];
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
    gap: 8,
  },
  viewerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  viewerSwatch: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(20,15,10,0.1)",
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  cardQuote: {
    fontSize: 15,
    fontStyle: "italic",
    lineHeight: 22,
  },
  editorSubLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
  },
  noteQuote: {
    borderLeftWidth: 2,
    paddingLeft: 12,
  },
  notePreview: {
    padding: 10,
    borderRadius: 8,
  },
  cardActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  viewerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  viewerPill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
  },
  viewerPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  noteInput: {
    minHeight: 110,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: "top",
  },
  askShortcut: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  askShortcutText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  editorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  editorCancel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
