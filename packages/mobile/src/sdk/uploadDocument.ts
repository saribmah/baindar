import type { Document } from "@baindar/sdk";

export type DocumentAsset = {
  uri: string;
  name: string;
  type: string;
};

// React Native's FormData polyfill recognizes `{ uri, name, type }` as a file
// part and streams the file from disk on send. The SDK's auto-generated
// formDataBodySerializer only handles Blob/File/string and falls back to
// JSON.stringify for everything else, which corrupts the upload. Bypass the
// SDK and call fetch directly via the authedFetch wrapper so the FormData
// reaches the network layer intact.
export async function uploadDocumentMultipart(
  baseUrl: string,
  fetchImpl: typeof fetch,
  asset: DocumentAsset,
): Promise<Document> {
  const form = new FormData();
  form.append("file", asset as unknown as Blob);
  const response = await fetchImpl(`${baseUrl}/documents`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload failed (${response.status})${text ? `: ${text}` : ""}`);
  }
  return (await response.json()) as Document;
}
