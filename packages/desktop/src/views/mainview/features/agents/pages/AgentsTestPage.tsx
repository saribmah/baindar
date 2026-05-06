import { useState } from "react";
import { useAgent } from "agents/react";
import { getAuthToken } from "../../auth";

type CounterState = { count: number };

const agentsHost = (import.meta.env.VITE_AGENTS_HOST as string | undefined) || undefined;

export function AgentsTestPage() {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const agent = useAgent<CounterState>({
    agent: "CounterAgent",
    name: "desktop-smoke",
    host: agentsHost,
    // WebSocket APIs can't set Authorization on the upgrade — pass the bearer
    // token via query string. The API promotes `?token=` to a Bearer header
    // before Better Auth validates the session (see api/src/instance/bootstrap).
    query: async (): Promise<Record<string, string | null>> => {
      const token = getAuthToken();
      return token ? { token } : {};
    },
    onStateUpdate: (state) => setCount(state.count),
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-bd-bg text-bd-fg">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-bd-border p-8">
        <header className="flex flex-col items-center gap-1">
          <h1 className="text-xl font-semibold">CounterAgent smoke test</h1>
          <p className="text-sm text-bd-fg-muted">
            instance: <code className="font-mono">desktop-smoke</code> ·{" "}
            <span className={connected ? "text-emerald-500" : "text-amber-500"}>
              {connected ? "connected" : "connecting…"}
            </span>
          </p>
        </header>
        <div className="text-6xl font-mono tabular-nums">{count}</div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-bd-border px-4 py-2 hover:bg-bd-bg-muted"
            onClick={() => agent.call("decrement")}
          >
            −
          </button>
          <button
            type="button"
            className="rounded border border-bd-border px-4 py-2 hover:bg-bd-bg-muted"
            onClick={() => agent.call("reset")}
          >
            reset
          </button>
          <button
            type="button"
            className="rounded border border-bd-border px-4 py-2 hover:bg-bd-bg-muted"
            onClick={() => agent.call("increment")}
          >
            +
          </button>
        </div>
        <p className="text-center text-xs text-bd-fg-muted">
          State is shared with the web smoke instance — they connect to different DOs by name.
        </p>
      </div>
    </main>
  );
}
