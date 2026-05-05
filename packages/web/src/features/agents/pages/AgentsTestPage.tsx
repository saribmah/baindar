import { useState } from "react";
import { useAgent } from "agents/react";

type CounterState = { count: number };

const agentsHost = import.meta.env.VITE_AGENTS_HOST || undefined;

export function AgentsTestPage() {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const agent = useAgent<CounterState>({
    agent: "CounterAgent",
    name: "web-smoke",
    host: agentsHost,
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
            instance: <code className="font-mono">web-smoke</code> ·{" "}
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
          State syncs across tabs. Open this page in another window and watch both numbers update.
        </p>
      </div>
    </main>
  );
}
