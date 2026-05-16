import Electrobun, { BrowserView, BrowserWindow, type ElectrobunEvent } from "electrobun/bun";
import { AUTH_CALLBACK_PATH, DEEP_LINK_SCHEME, type DesktopRPCSchema } from "../shared/rpc";
import { clearKeychainToken, getKeychainToken, setKeychainToken } from "./keychain";

// Dev: Vite serves the view at http://localhost:3003 (see scripts/dev.ts).
// Prod: the bundled view is copied to views://mainview/ via electrobun.config.ts.
//
// IMPORTANT: do NOT key off `process.env.NODE_ENV`. Bun's bundler inlines that
// constant at build time, so if you run `bun run build` from a shell where
// NODE_ENV=development (e.g. after running `bun run dev`), the production
// .app gets `isDev = true` baked in and loads localhost:3003 forever. Use a
// dedicated var that only scripts/dev.ts sets and that Bun leaves as a
// runtime lookup.
const isDev = process.env.BAINDAR_DESKTOP_DEV === "1";
const viewUrl = isDev ? "http://localhost:3003" : "views://mainview/index.html";

const rpc = BrowserView.defineRPC<DesktopRPCSchema>({
  handlers: {
    requests: {
      "auth.getToken": async () => {
        try {
          return await getKeychainToken();
        } catch (error) {
          console.error("[baindar-desktop] keychain read failed:", error);
          return null;
        }
      },
      "auth.setToken": async ({ token }) => {
        await setKeychainToken(token);
      },
      "auth.clearToken": async () => {
        await clearKeychainToken();
      },
    },
  },
});

const mainWindow = new BrowserWindow({
  title: "Baindar",
  url: viewUrl,
  rpc,
  frame: {
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
  },
  titleBarStyle: "hiddenInset",
});

// Custom URL scheme deep-link delivery (registered in electrobun.config.ts →
// app.urlSchemes). Only `baindar-desktop://auth/callback?code=…&state=…` is
// accepted; anything else is dropped so a hostile handler cannot navigate
// the webview off-origin and harvest the bearer token from session/local
// state.
Electrobun.events.on("open-url", (event: ElectrobunEvent<{ url: string }, void>) => {
  const callback = parseAuthCallback(event.data.url);
  if (!callback) {
    console.warn("[baindar-desktop] dropped untrusted deep link:", event.data.url);
    return;
  }
  mainWindow.webview.rpc?.send["auth.callback"](callback);
});

const parseAuthCallback = (raw: string): { code: string; state: string | null } | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== DEEP_LINK_SCHEME) return null;
  // URL parses `baindar-desktop://auth/callback` with host="auth" and
  // pathname="/callback"; reconstruct the logical path for comparison.
  const path = `/${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  if (path !== AUTH_CALLBACK_PATH) return null;
  const code = url.searchParams.get("code");
  if (!code) return null;
  return { code, state: url.searchParams.get("state") };
};
