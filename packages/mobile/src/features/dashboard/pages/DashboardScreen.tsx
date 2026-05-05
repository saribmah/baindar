import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icons, Toast, color, useThemeColors, useThemedStyles } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { useProfileName } from "../../profile";
import { DashboardContent } from "../components/DashboardContent";
import { DropDashboard, FilteredEmpty } from "../components/DashboardEmptyStates";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardLoading } from "../components/DashboardLoading";
import { DeleteDialog, RenameDialog } from "../components/DocumentDialogs";
import { buildDashboardStyles } from "../dashboard.styles";
import { useDashboardDocuments } from "../hooks/useDashboardDocuments";

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reader = useProfileName();
  const styles = useThemedStyles(buildDashboardStyles);
  const palette = useThemeColors();
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const {
    documents,
    pendingDocuments,
    inProgressDocuments,
    recentDocuments,
    hasDocuments,
    isFilteredEmpty,
    error,
    uploading,
    toast,
    query,
    setQuery,
    refresh,
    uploadDocument,
    renameDocument,
    deleteDocument,
  } = useDashboardDocuments();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const openDocumentMenu = (doc: Document) => {
    const actions = ["Rename", "Delete", "Cancel"];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: actions,
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) setRenameTarget(doc);
          if (index === 1) setDeleteTarget(doc);
        },
      );
      return;
    }

    Alert.alert(doc.title, undefined, [
      { text: "Rename", onPress: () => setRenameTarget(doc) },
      { text: "Delete", style: "destructive", onPress: () => setDeleteTarget(doc) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 98 },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.fgMuted}
          />
        }
      >
        <DashboardHeader
          reader={reader}
          searchOpen={searchOpen}
          query={query}
          onQuery={setQuery}
          onToggleSearch={() => setSearchOpen((open) => !open)}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {documents === null ? (
          <DashboardLoading />
        ) : isFilteredEmpty ? (
          <FilteredEmpty query={query} />
        ) : !hasDocuments ? (
          <DropDashboard uploading={uploading} onUpload={uploadDocument} />
        ) : (
          <DashboardContent
            inProgress={inProgressDocuments.slice(0, 2)}
            recent={recentDocuments.slice(0, 6)}
            pending={pendingDocuments}
            uploading={uploading}
            onUpload={uploadDocument}
            onOpen={(doc) => router.push(`/read/${doc.id}`)}
            onOpenDetails={(doc) =>
              router.push({ pathname: "/library/[id]", params: { id: doc.id } })
            }
            onSeeAllInProgress={() =>
              router.push({
                pathname: "/library/shelves/[id]",
                params: { id: "smart:reading" },
              })
            }
            onSeeAllRecent={() => router.push("/library")}
            onMore={openDocumentMenu}
          />
        )}
      </ScrollView>

      {renameTarget && (
        <RenameDialog
          doc={renameTarget}
          onCancel={() => setRenameTarget(null)}
          onSave={async (title) => {
            await renameDocument(renameTarget, title);
            setRenameTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          doc={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await deleteDocument(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      )}

      {toast && (
        <View style={[styles.toastWrap, { bottom: insets.bottom + 78 }]}>
          <Toast iconStart={<Icons.Check size={18} color={color.status.success} />}>{toast}</Toast>
        </View>
      )}
    </View>
  );
}
