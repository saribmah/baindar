import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation } from "@baindar/sdk";
import { useSdk } from "../../../sdk";

type Status = "loading" | "ready" | "error";

// Sidebar's data layer. Loads the user's conversations on mount, exposes
// the currently-selected one, and wraps the SDK mutations so the page
// stays focused on layout. After every mutation the local list is
// updated optimistically and `refresh` is called only on errors — the
// SDK is the source of truth, but a network round-trip per click is
// pointless when the response already gives us the row.
export function useConversations() {
  const { client } = useSdk();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await client.conversation.list();
      if (!res.data) {
        setStatus("error");
        setError("Failed to load conversations");
        return [] as Conversation[];
      }
      const items = res.data.items;
      setConversations(items);
      setStatus("ready");
      setError(null);
      return items;
    } catch (err) {
      setStatus("error");
      setError(String(err));
      return [] as Conversation[];
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const items = await refresh();
      if (cancelled) return;
      // Auto-select the most-recent conversation on first load (server
      // orders by lastActivityAt desc). If there are none, leave the
      // selection empty so the empty-state CTA shows.
      setSelectedId(items[0]?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const select = useCallback((id: string) => setSelectedId(id), []);

  const create = useCallback(async () => {
    try {
      const res = await client.conversation.create({});
      if (!res.data) {
        setError("Failed to start a conversation");
        return null;
      }
      const created = res.data;
      // Insert at the top — the list is ordered by lastActivityAt desc
      // and a brand-new row has the most recent activity.
      setConversations((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setError(null);
      return created;
    } catch (err) {
      setError(String(err));
      return null;
    }
  }, [client]);

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await client.conversation.update({ id, title });
        if (!res.data) {
          setError("Failed to rename");
          return;
        }
        const updated = res.data;
        setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    },
    [client],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await client.conversation.delete({ id });
        if (res.error) {
          setError("Failed to delete");
          return;
        }
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== id);
          // If the active conversation was deleted, fall back to the
          // next-most-recent. If none remain, clear selection so the
          // empty state surfaces.
          if (selectedId === id) {
            setSelectedId(next[0]?.id ?? null);
          }
          return next;
        });
        setError(null);
      } catch (err) {
        setError(String(err));
      }
    },
    [client, selectedId],
  );

  return {
    conversations,
    selected,
    selectedId,
    status,
    error,
    select,
    create,
    rename,
    remove,
    refresh,
  };
}
