import { useCallback, useEffect, useMemo, useState } from "react";
import type { Conversation } from "@baindar/sdk";
import { useSdk } from "../../../sdk/sdk.provider.tsx";

type Status = "loading" | "ready" | "error";
type CreateConversationInput = {
  title?: string;
  primaryDocId?: string;
};

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
      setConversations(res.data.items);
      setStatus("ready");
      setError(null);
      return res.data.items;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      return [] as Conversation[];
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const create = useCallback(
    async (input: CreateConversationInput = {}) => {
      try {
        const res = await client.conversation.create(input);
        if (!res.data) {
          setError("Failed to start a conversation");
          return null;
        }
        setConversations((prev) => [res.data, ...prev]);
        setSelectedId(res.data.id);
        setError(null);
        return res.data;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [client],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await client.conversation.update({ id, title });
        if (!res.data) {
          setError("Failed to rename conversation");
          return;
        }
        setConversations((prev) =>
          prev.map((conversation) => (conversation.id === res.data.id ? res.data : conversation)),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await client.conversation.delete({ id });
        if (res.error) {
          setError("Failed to delete conversation");
          return;
        }
        setConversations((prev) => {
          const next = prev.filter((conversation) => conversation.id !== id);
          if (selectedId === id) setSelectedId(null);
          return next;
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
    select: setSelectedId,
    create,
    rename,
    remove,
    refresh,
  };
}
