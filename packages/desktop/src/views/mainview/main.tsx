import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bridge } from "./bridge/electrobun";
import { hydrateAuthToken } from "./features/auth/auth.client";
import { SDKProvider } from "./sdk";
import "./styles.css";

// Electrobun's webview ignores `target="_blank"` and won't navigate to
// http(s)/mailto URLs from inside `views://mainview/`. Intercept clicks on
// external-target anchors here so existing `<a target="_blank">` markup in
// shared web code (landing, billing portal, footer) opens in the OS
// browser. Internal react-router `<Link>`s never set `target="_blank"`, so
// in-app navigation is unaffected.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as HTMLElement | null)?.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href) return;
  if (anchor.target !== "_blank" && !/^(https?:|mailto:)/.test(href)) return;
  event.preventDefault();
  void bridge.openExternal(href).catch((error: unknown) => {
    console.error("[baindar-desktop] openExternal failed:", error);
  });
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

// Read the bearer token out of Keychain before the first React render so
// `useSession` and the SDK both go out with `Authorization: Bearer …` on
// their first request. Otherwise the initial `/auth/get-session` call
// 401s, the UI bounces to `/`, and we lose the signed-in state across
// every app launch.
await hydrateAuthToken();

createRoot(rootElement).render(
  <StrictMode>
    <SDKProvider>
      <App />
    </SDKProvider>
  </StrictMode>,
);
