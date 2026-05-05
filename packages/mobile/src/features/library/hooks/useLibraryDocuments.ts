import { useCallback, useEffect, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import type { Document } from "@baindar/sdk";
import { useSdk } from "../../../sdk/sdk.provider";
import { uploadDocumentMultipart } from "../../../sdk/uploadDocument";
import { filterDocuments, sortDocuments } from "../utils/document";
import type { LibraryFilter } from "../constants";

export function useLibraryDocuments() {
  const { client, baseUrl, authedFetch } = useSdk();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");

  const refresh = useCallback(async () => {
    try {
      const res = await client.document.list();
      if (res.data) {
        setDocuments(sortDocuments(res.data.items));
        setError(null);
      } else {
        setError("Failed to load library");
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

  const filteredDocuments = useMemo(() => {
    if (!documents) return null;
    return filterDocuments(documents, query, filter);
  }, [documents, filter, query]);

  const counts = useMemo(() => {
    const all = documents?.length ?? 0;
    const books = documents?.filter((doc) => doc.kind === "epub").length ?? 0;
    return { all, books, pdfs: 0, articles: 0 };
  }, [documents]);

  return {
    documents,
    filteredDocuments,
    counts,
    error,
    uploading,
    toast,
    query,
    setQuery,
    filter,
    setFilter,
    refresh,
    uploadDocument,
  };
}
