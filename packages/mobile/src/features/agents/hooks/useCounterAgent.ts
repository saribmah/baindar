import { useEffect, useRef, useState } from "react";
import { AgentClient } from "agents/client";
import { AGENTS_HOST, AGENTS_SECURE } from "../../../config.ts";

type CounterState = { count: number };

export function useCounterAgent(instance: string) {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<AgentClient | null>(null);

  useEffect(() => {
    const client = new AgentClient({
      agent: "CounterAgent",
      name: instance,
      host: AGENTS_HOST,
      protocol: AGENTS_SECURE ? "wss" : "ws",
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
