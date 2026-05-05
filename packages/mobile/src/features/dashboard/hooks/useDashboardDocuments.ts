import { useCallback, useEffect, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import type { Document } from "@baindar/sdk";
import { useSdk } from "../../../sdk/sdk.provider";
import { uploadDocumentMultipart } from "../../../sdk/uploadDocument";
import { filterDocuments, sortByCreatedAtDesc } from "../utils/document";

export function useDashboardDocuments() {
  const { client, baseUrl, authedFetch } = useSdk();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await client.document.list();
      if (res.data) {
        setDocuments(res.data.items);
        setError(null);
      } else {
        setError("Failed to load documents");
      }
    } catch (err) {
      setError(String(err));
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!documents) return;
    const hasPending = documents.some(
      (doc) => doc.status === "uploading" || doc.status === "processing",
    );
    if (!hasPending) return;
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const uploadDocument = useCallback(async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/epub+zip"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset) return;

    setUploading(true);
    try {
      await uploadDocumentMultipart(baseUrl, authedFetch, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
      });
      setToast(`Uploaded ${asset.name}`);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  }, [authedFetch, baseUrl, refresh]);

  const renameDocument = useCallback(
    async (doc: Document, title: string) => {
      try {
        const res = await client.document.update({ id: doc.id, title });
        if (res.data) {
          const updated = res.data;
          setDocuments((prev) =>
            prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev,
          );
          setToast("Renamed");
        } else {
          setError("Rename failed");
        }
      } catch (err) {
        setError(String(err));
      }
    },
    [client],
  );

  const deleteDocument = useCallback(
    async (doc: Document) => {
      try {
        const res = await client.document.delete({ id: doc.id });
        if (res.error) {
          setError("Delete failed");
          return;
        }
        setDocuments((prev) => (prev ? prev.filter((item) => item.id !== doc.id) : prev));
        setToast(`Deleted ${doc.title}`);
      } catch (err) {
        setError(String(err));
      }
    },
    [client],
  );

  const filteredDocuments = useMemo(() => {
    if (!documents) return null;
    return filterDocuments(documents, query);
  }, [documents, query]);

  const readyDocuments = useMemo(
    () => filteredDocuments?.filter((doc) => doc.status === "processed") ?? [],
    [filteredDocuments],
  );

  const pendingDocuments = useMemo(
    () => filteredDocuments?.filter((doc) => doc.status !== "processed") ?? [],
    [filteredDocuments],
  );

  const inProgressDocuments = useMemo(
    () =>
      readyDocuments
        .filter((doc) => doc.progress)
        .concat(readyDocuments.filter((doc) => !doc.progress)),
    [readyDocuments],
  );

  const recentDocuments = useMemo(() => sortByCreatedAtDesc(readyDocuments), [readyDocuments]);
  const hasDocuments = (documents?.length ?? 0) > 0;
  const isFilteredEmpty =
    filteredDocuments !== null && filteredDocuments.length === 0 && hasDocuments;

  return {
    documents,
    readyDocuments,
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
  };
}
