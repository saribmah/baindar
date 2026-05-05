import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChipButton,
  Icons,
  Input,
  Toast,
  Wordmark,
  color,
  useThemeColors,
  useThemedStyles,
} from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { FILTER_LABEL, type LibraryFilter } from "../constants";
import { LibraryCover } from "../components/LibraryCover";
import { ShelfCard } from "../components/ShelfArtwork";
import { AddToShelfSheet, CreateShelfSheet } from "../components/ShelfSheets";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryShelves } from "../hooks/useLibraryShelves";
import { buildLibraryStyles, type LibraryStyles } from "../library.styles";
import { progressPercent, sourceLabel, statusLabel } from "../utils/document";
import { CUSTOM_SHELF_LIMIT } from "../utils/shelf";

const filters: LibraryFilter[] = ["all", "books", "pdfs", "articles"];

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const styles = useThemedStyles(buildLibraryStyles);
  const palette = useThemeColors();
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [createShelfOpen, setCreateShelfOpen] = useState(false);
  const [createShelfDocument, setCreateShelfDocument] = useState<Document | null>(null);
  const [sheetDocument, setSheetDocument] = useState<Document | null>(null);
  const itemWidth = Math.floor((width - 48 - 28) / 3);
  const {
    documents,
    filteredDocuments,
    counts,
    error,
    toast,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
  } = useLibraryDocuments();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  const {
    shelves,
    customShelves,
    memberships,
    error: shelfError,
    toast: shelfToast,
    workingShelfId,
    createShelf,
    addDocumentToShelf,
    toggleDocumentShelf,
  } = useLibraryShelves(documents);

  const visible = filteredDocuments ?? [];
  const openCreateShelf = (doc: Document | null = null) => {
    setCreateShelfDocument(doc);
    setCreateShelfOpen(true);
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={documents === null ? [] : visible}
        keyExtractor={(doc) => doc.id}
        numColumns={3}
        columnWrapperStyle={styles.gridRow}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          styles.grid,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.fgMuted}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Wordmark size="sm" />
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.iconButton}
                  onPress={() => {
                    setSearchOpen((open) => !open);
                    if (searchOpen) setQuery("");
                  }}
                >
                  <Icons.Search size={16} color={palette.fg} />
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.iconButton}>
                  <Icons.Filter size={16} color={palette.fg} />
                </Pressable>
              </View>
            </View>

            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>
                {counts.all} items · {shelves?.length ?? customShelves.length} shelves
              </Text>
              <Text style={styles.title}>Library</Text>
            </View>

            {searchOpen && (
              <View style={styles.searchWrap}>
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Filter library..."
                  autoFocus
                  iconStart={<Icons.Search size={16} />}
                />
              </View>
            )}

            <View style={styles.shelvesBlock}>
              <View style={styles.shelvesHeader}>
                <Text style={styles.eyebrow}>Your shelves</Text>
                <Pressable accessibilityRole="button" onPress={() => openCreateShelf()}>
                  <Text style={styles.shelfNewText}>+ New</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.shelvesRow}
              >
                {(shelves ?? []).slice(0, CUSTOM_SHELF_LIMIT + 2).map((shelf, index) => (
                  <ShelfCard
                    key={shelf.id}
                    shelf={shelf}
                    compact
                    active={index === 0}
                    onPress={() =>
                      router.push({ pathname: "/library/shelves/[id]", params: { id: shelf.id } })
                    }
                  />
                ))}
                {shelves !== null && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.newShelfCard}
                    onPress={() => openCreateShelf()}
                  >
                    <Icons.Plus size={16} color={palette.fgMuted} />
                    <Text style={styles.newShelfText}>New shelf</Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {filters.map((item) => (
                <ChipButton
                  key={item}
                  variant={filter === item ? "active" : "filled"}
                  onPress={() => setFilter(item)}
                >
                  {FILTER_LABEL[item]} · {counts[item]}
                </ChipButton>
              ))}
            </ScrollView>

            {error && <Text style={styles.error}>{error}</Text>}
            {shelfError && <Text style={styles.error}>{shelfError}</Text>}
            {documents !== null && visible.length === 0 && (
              <EmptyLibrary query={query} styles={styles} />
            )}
          </>
        }
        renderItem={({ item }) => (
          <LibraryGridItem
            doc={item}
            width={itemWidth}
            shelfCount={memberships[item.id]?.length ?? 0}
            styles={styles}
            badgeIconColor={palette.actionFg}
            onPress={() => {
              if (item.status === "processed") router.push(`/library/${item.id}`);
            }}
            onLongPress={() => setSheetDocument(item)}
          />
        )}
      />

      {toast && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 78 }}>
          <Toast iconStart={<Icons.Check size={18} color={color.status.success} />}>{toast}</Toast>
        </View>
      )}
      {shelfToast && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 78 }}>
          <Toast iconStart={<Icons.Check size={18} color={color.status.success} />}>
            {shelfToast}
          </Toast>
        </View>
      )}
      <AddToShelfSheet
        visible={Boolean(sheetDocument)}
        doc={sheetDocument}
        shelves={customShelves}
        selectedShelves={sheetDocument ? (memberships[sheetDocument.id] ?? []) : []}
        workingShelfId={workingShelfId}
        onClose={() => setSheetDocument(null)}
        onToggle={(shelf, selected) => {
          if (!sheetDocument) return;
          void toggleDocumentShelf(shelf, sheetDocument.id, selected);
        }}
        onCreate={() => {
          setCreateShelfDocument(sheetDocument);
          setSheetDocument(null);
          setCreateShelfOpen(true);
        }}
      />
      <CreateShelfSheet
        visible={createShelfOpen}
        onClose={() => {
          setCreateShelfOpen(false);
          setCreateShelfDocument(null);
        }}
        onCreate={async (draft) => {
          const shelf = await createShelf(draft);
          if (shelf && createShelfDocument) {
            await addDocumentToShelf(shelf, createShelfDocument.id);
          }
          if (shelf) {
            setCreateShelfOpen(false);
            setCreateShelfDocument(null);
          }
        }}
      />
    </View>
  );
}

function LibraryGridItem({
  doc,
  width,
  shelfCount,
  styles,
  badgeIconColor,
  onPress,
  onLongPress,
}: {
  doc: Document;
  width: number;
  shelfCount: number;
  styles: LibraryStyles;
  badgeIconColor: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const pct = progressPercent(doc);
  const active = doc.status === "processed" && pct > 0 && pct < 100;

  return (
    <View style={[styles.gridItem, { width }]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={doc.status !== "processed"}
        style={styles.coverPress}
      >
        <LibraryCover doc={doc} width={width} height={Math.round(width / 0.66)} />
        {shelfCount > 0 && (
          <View style={styles.shelfBadge}>
            <Icons.Bookmark size={8} color={badgeIconColor} />
            <Text style={styles.shelfBadgeText}>{shelfCount}</Text>
          </View>
        )}
      </Pressable>
      <Text style={styles.itemTitle} numberOfLines={2}>
        {doc.title}
      </Text>
      <Text style={styles.itemSub} numberOfLines={1}>
        {sourceLabel(doc)} · {statusLabel(doc)}
      </Text>
      {active && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      )}
    </View>
  );
}

function EmptyLibrary({ query, styles }: { query: string; styles: LibraryStyles }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{query.trim() ? "No matches" : "No documents yet"}</Text>
      <Text style={styles.emptyText}>
        {query.trim() ? "Try a different title or filename." : "Tap Add to import the first EPUB."}
      </Text>
    </View>
  );
}
