import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hydrateAuthToken } from "./features/auth/auth.client";
import { SDKProvider } from "./sdk";
import "./styles.css";

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
