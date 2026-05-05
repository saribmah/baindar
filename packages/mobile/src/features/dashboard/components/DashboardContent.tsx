import { Text, View } from "react-native";
import { Card, useThemedStyles } from "@baindar/ui";
import type { Document } from "@baindar/sdk";
import { buildDashboardStyles } from "../dashboard.styles";
import { DocumentRow, RecentCard } from "./DocumentCards";
import { QuickAdd } from "./QuickAdd";
import { SectionHeader } from "./SectionHeader";

export function DashboardContent({
  inProgress,
  recent,
  pending,
  uploading,
  onUpload,
  onOpen,
  onOpenDetails,
  onSeeAllInProgress,
  onSeeAllRecent,
  onMore,
}: {
  inProgress: Document[];
  recent: Document[];
  pending: Document[];
  uploading: boolean;
  onUpload: () => void;
  onOpen: (doc: Document) => void;
  onOpenDetails: (doc: Document) => void;
  onSeeAllInProgress: () => void;
  onSeeAllRecent: () => void;
  onMore: (doc: Document) => void;
}) {
  const styles = useThemedStyles(buildDashboardStyles);
  return (
    <View>
      <QuickAdd uploading={uploading} onPress={onUpload} />

      {pending.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Processing" meta={`${pending.length} queued`} />
          <View style={styles.stack}>
            {pending.slice(0, 2).map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader
          title="Pick up where you left off"
          meta="See all"
          onMetaPress={onSeeAllInProgress}
        />
        <View style={styles.stack}>
          {inProgress.length > 0 ? (
            inProgress.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onPress={() => onOpen(doc)} />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>
                Open a document and Baindar will keep your place here.
              </Text>
            </Card>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recently added" meta="See all" onMetaPress={onSeeAllRecent} />
        <View style={styles.recentGrid}>
          {recent.map((doc) => (
            <RecentCard
              key={doc.id}
              doc={doc}
              onPress={() => onOpenDetails(doc)}
              onMore={() => onMore(doc)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
