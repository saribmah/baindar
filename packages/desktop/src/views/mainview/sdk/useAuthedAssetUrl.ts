import { useEffect, useState } from "react";
import { useSdk } from "./sdk.provider";

// Desktop auth is bearer-in-memory; the browser's `<img>` requests don't
// carry our Authorization header, so any direct src= to the API 401s. This
// hook fetches the asset through the SDK's authedFetch and exposes the
// bytes as a `blob:` URL that <img> can load without auth.
//
// Cache: blob URLs are kept in a module-level map for the lifetime of the
// page. Covers in the dashboard/library are referenced from many places
// across navigations; refetching every time is wasteful and racy. Failures
// are NOT cached so a retry on the next render kicks off a fresh fetch.
//
// Memory: object URLs are not revoked. A personal binder shows on the
// order of hundreds of covers across a session; the bytes themselves live
// in the renderer until reload, which is the right tradeoff vs the
// complexity of ref-counted revocation.
const cache = new Map<string, Promise<string>>();

// Non-hook variant for callers that need to resolve many URLs at once
// (e.g. rewriting every <img> in a chapter). Shares the same cache as the
// hook below, so a cover that already loaded on the library doesn't refetch
// when the same asset appears inside the reader.
export const loadAuthedAssetUrl = (url: string, authedFetch: typeof fetch): Promise<string> => {
  let promise = cache.get(url);
  if (!promise) {
    promise = authedFetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    });
    cache.set(url, promise);
  }
  return promise.catch((error) => {
    cache.delete(url);
    throw error;
  });
};

export const useAuthedAssetUrl = (url: string | null): string | null => {
  const { authedFetch } = useSdk();
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    loadAuthedAssetUrl(url, authedFetch)
      .then((blobUrl) => {
        if (!cancelled) setResolved(blobUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) setResolved(null);
        console.error("[asset] failed to load", url, error);
      });
    return () => {
      cancelled = true;
    };
  }, [authedFetch, url]);

  return resolved;
};
