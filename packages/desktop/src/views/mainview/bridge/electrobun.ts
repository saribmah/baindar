import { Electroview } from "electrobun/view";
import type { AuthCallbackPayload, DesktopRPCSchema } from "../../../shared/rpc";

// Single Electroview instance for the mainview. Constructing it sets up the
// localhost WebSocket transport against the bun process and starts handling
// `auth.callback` messages. Module-level singleton — the file is imported
// during app bootstrap and reused everywhere via `getBridge()`.

const rpc = Electroview.defineRPC<DesktopRPCSchema>({
  handlers: {
    messages: {
      "auth.callback": (payload) => {
        for (const listener of authCallbackListeners) listener(payload);
      },
    },
  },
});

new Electroview({ rpc });

const authCallbackListeners = new Set<(payload: AuthCallbackPayload) => void>();

export const onAuthCallback = (listener: (payload: AuthCallbackPayload) => void): (() => void) => {
  authCallbackListeners.add(listener);
  return () => authCallbackListeners.delete(listener);
};

export const bridge = {
  getToken: (): Promise<string | null> => rpc.request["auth.getToken"](),
  setToken: (token: string): Promise<void> =>
    rpc.request["auth.setToken"]({ token }) as unknown as Promise<void>,
  clearToken: (): Promise<void> => rpc.request["auth.clearToken"]() as unknown as Promise<void>,
  openExternal: (url: string): Promise<void> =>
    rpc.request["system.openExternal"]({ url }) as unknown as Promise<void>,
};
