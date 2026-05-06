import { useEffect, useRef, useState } from "react";
import { AgentClient } from "agents/client";
import { AGENTS_HOST, AGENTS_SECURE } from "../../../config.ts";
import { authClient } from "../../auth";

type CounterState = { count: number };

// Better Auth's expo plugin stores the session under this cookie name. We
// pass the same value as a Bearer token via the `?token=` query param since
// React Native's WebSocket can't set Authorization on the upgrade.
const SESSION_COOKIE = "better-auth.session_token";

const sessionTokenFromCookie = (): string | null => {
  const cookies = authClient.getCookie();
  if (!cookies) return null;
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
};

export function useCounterAgent(instance: string) {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<AgentClient | null>(null);

  useEffect(() => {
    const token = sessionTokenFromCookie();
    const client = new AgentClient({
      agent: "CounterAgent",
      name: instance,
      host: AGENTS_HOST,
      protocol: AGENTS_SECURE ? "wss" : "ws",
      query: token ? { token } : undefined,
      onStateUpdate: (state) => setCount((state as CounterState).count),
    });
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    client.addEventListener("open", onOpen);
    client.addEventListener("close", onClose);
    clientRef.current = client;
    return () => {
      client.removeEventListener("open", onOpen);
      client.removeEventListener("close", onClose);
      client.close();
      clientRef.current = null;
    };
  }, [instance]);

  const call = (method: "increment" | "decrement" | "reset") => {
    void clientRef.current?.call(method);
  };

  return { count, connected, call };
}
