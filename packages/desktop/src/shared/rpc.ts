// Shared bun ↔ webview RPC schema. Imported from both the main process
// (`src/main/*`, tsconfig.main.json) and the React view (`src/views/*`,
// tsconfig.json). Keep payloads JSON-serializable — the transport is a
// localhost WebSocket between Electrobun's bun process and the webview.

export type AuthCallbackPayload = {
  code: string;
  state: string | null;
};

export type DesktopRPCSchema = {
  bun: {
    requests: {
      "auth.getToken": { params: undefined; response: string | null };
      "auth.setToken": { params: { token: string }; response: void };
      "auth.clearToken": { params: undefined; response: void };
      "system.openExternal": { params: { url: string }; response: void };
    };
    messages: Record<never, unknown>;
  };
  webview: {
    requests: Record<never, { params: unknown; response: unknown }>;
    messages: {
      "auth.callback": AuthCallbackPayload;
    };
  };
};

// Single source of truth for the deep-link scheme + callback path. The bun
// process validates incoming `open-url` events against these before
// forwarding anything to the webview.
export const DEEP_LINK_SCHEME = "baindar-desktop:";
export const AUTH_CALLBACK_PATH = "/auth/callback";

// Keychain coordinates. Keep stable: the bundle identifier (see
// electrobun.config.ts) is what macOS associates the entry with. Changing
// either string strands every existing user's stored token.
export const KEYCHAIN_SERVICE = "app.baindar.desktop";
export const KEYCHAIN_ACCOUNT = "bearer";
