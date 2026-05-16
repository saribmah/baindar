import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { bridge, onAuthCallback } from "../../bridge/electrobun";

const baseURL = import.meta.env.VITE_AUTH_URL as string | undefined;
if (!baseURL) {
  throw new Error("VITE_AUTH_URL is required (see packages/desktop/.env.development).");
}

// Mirror of the Keychain-backed bearer token. The source of truth is macOS
// Keychain (`bridge.getToken/setToken/clearToken`); this in-memory copy is
// kept in sync so synchronous getters (`getAuthToken`, Better Auth's
// `token: () => …`) don't have to await on every request. Hydrated once at
// boot via `hydrateAuthToken`, refreshed on every Better Auth response that
// carries a new `set-auth-token` header, and cleared on `signOut`.
let bearerToken: string | null = null;

export const getAuthToken = (): string | null => bearerToken;

export const hydrateAuthToken = async (): Promise<void> => {
  try {
    bearerToken = await bridge.getToken();
  } catch (error) {
    console.error("[baindar-desktop] failed to hydrate auth token:", error);
    bearerToken = null;
  }
};

const persistToken = (token: string): void => {
  bearerToken = token;
  void bridge.setToken(token).catch((error) => {
    console.error("[baindar-desktop] failed to persist auth token:", error);
  });
};

const clearToken = (): void => {
  bearerToken = null;
  void bridge.clearToken().catch((error) => {
    console.error("[baindar-desktop] failed to clear auth token:", error);
  });
};

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => bearerToken ?? "",
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) persistToken(token);
    },
  },
});

const baseSignOut = authClient.signOut;
const signOutAndClear: typeof baseSignOut = async (...args) => {
  try {
    return await baseSignOut(...args);
  } finally {
    clearToken();
  }
};

// OAuth deep-link landing pad. Today only email-OTP is wired; when Google
// or Apple is enabled the callback URL (baindar-desktop://auth/callback)
// is validated by the bun process and forwarded here as an RPC message.
// Better Auth's social callback endpoint completes the exchange and emits
// `set-auth-token`, which our `onSuccess` hook persists to Keychain.
onAuthCallback(({ code, state }) => {
  void authClient.$fetch("/oauth2/callback", {
    method: "POST",
    body: { code, state },
  });
});

export const { signIn, signUp, useSession } = authClient;
export const signOut = signOutAndClear;
