import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipButton, Skeleton, Wordmark, useThemedStyles } from "@baindar/ui";
import type { Highlight } from "@baindar/sdk";
import { PlanBadge } from "../../billing";
import { HIGHLIGHT_COLOR, HIGHLIGHT_LABEL } from "../constants";
import { useLibraryDocuments } from "../hooks/useLibraryDocuments";
import { useLibraryHighlights, type LibraryHighlight } from "../hooks/useLibraryHighlights";
import { buildLibraryStyles, type LibraryStyles } from "../library.styles";

type ColorFilter = Highlight["color"] | "all";
type ReaderHighlightParams = {
  id: string;
  chapter?: string;
  highlight: string;
  target: string;
};

const colorFilters: ColorFilter[] = ["all", "pink", "yellow", "blue", "green", "purple"];

export function HighlightsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(buildLibraryStyles);
  const { documents } = useLibraryDocuments();
  const { highlights, error } = useLibraryHighlights(documents);
  const [filter, setFilter] = useState<ColorFilter>("all");

  const visible = useMemo(() => {
    if (!highlights) return null;
    return filter === "all" ? highlights : highlights.filter((item) => item.color === filter);
  }, [filter, highlights]);

  const colorCounts = useMemo(() => {
    const base: Record<Highlight["color"], number> = {
      pink: 0,
      yellow: 0,
      green: 0,
      blue: 0,
      purple: 0,
    };
    for (const item of highlights ?? []) base[item.color] += 1;
    return base;
  }, [highlights]);

  const sourceCount = useMemo(() => {
    const ids = new Set<string>();
    for (const item of highlights ?? []) ids.add(item.documentId);
    return ids.size;
  }, [highlights]);

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
          <View style={styles.brandRow}>
            <Wordmark size="sm" />
            <PlanBadge />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>
            {highlights?.length ?? 0} highlights · {sourceCount} sources
          </Text>
          <Text style={styles.title}>Highlights</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {colorFilters.map((item) => (
            <ChipButton
              key={item}
              variant={filter === item ? "active" : "outline"}
              onPress={() => setFilter(item)}
            >
              {item === "all" ? "All" : `${HIGHLIGHT_LABEL[item]} · ${colorCounts[item]}`}
            </ChipButton>
          ))}
        </ScrollView>

        {error && <Text style={styles.error}>{error}</Text>}
        {!visible ? (
          <HighlightsSkeleton styles={styles} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No highlights yet</Text>
            <Text style={styles.emptyText}>Marked passages will collect here.</Text>
          </View>
        ) : (
          visible.map((item) => (
            <HighlightItem
              key={item.id}
              item={item}
              styles={styles}
              onOpen={() =>
                router.push({ pathname: "/read/[id]", params: readerHighlightParams(item) })
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function HighlightItem({
  item,
  styles,
  onOpen,
}: {
  item: LibraryHighlight;
  styles: LibraryStyles;
  onOpen: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" style={styles.highlightItem} onPress={onOpen}>
      <View style={styles.highlightMeta}>
        <View style={[styles.highlightDot, { backgroundColor: HIGHLIGHT_COLOR[item.color] }]} />
        <Text style={styles.highlightSource} numberOfLines={1}>
          {item.document.title}
        </Text>
        <Text style={styles.highlightDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text style={[styles.quote, { borderLeftColor: HIGHLIGHT_COLOR[item.color] }]}>
        "{item.textSnippet}"
      </Text>
    </Pressable>
  );
}

function readerHighlightParams(item: LibraryHighlight): ReaderHighlightParams {
  const order = sectionOrderFromKey(item.sectionKey);
  return {
    id: item.document.id,
    ...(order !== null ? { chapter: String(order) } : {}),
    highlight: item.id,
    target: "1",
  };
}

function sectionOrderFromKey(sectionKey: string): number | null {
  const match = /:(\d+)$/.exec(sectionKey);
  return match ? Number(match[1]) : null;
}

function HighlightsSkeleton({ styles }: { styles: LibraryStyles }) {
  return (
    <View>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.highlightItem}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="95%" height={42} />
          <Skeleton width="70%" height={14} />
        </View>
      ))}
    </View>
  );
}
