import type { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bootstrap } from "../instance/bootstrap";
import { errorHandler } from "../middleware/error";
import type { AppEnv } from "./context";

const originFromPublicHost = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return `https://${value}`;
  }
};

const configuredOrigins = (raw: string | undefined): Set<string> =>
  new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

// Desktop webview origin. Electrobun loads the production view from
// views://mainview/index.html — that scheme can't be put in an env var
// because WebKit decides it, not us. Allowed unconditionally so the SDK's
// cross-origin fetches to the API succeed after sign-in.
//
// Mobile is intentionally NOT here. React Native's `fetch` is a native
// HTTP client that doesn't enforce CORS, so Access-Control-Allow-Origin
// is irrelevant on those requests. Better Auth's `trustedOrigins`
// (packages/api/src/user/auth.ts) is the real allowlist for mobile —
// that's a server-side CSRF check, not a browser CORS check.
const nativeClientOrigins = new Set(["views://mainview"]);

export const withBase = (app: Hono<AppEnv>): Hono<AppEnv> => {
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin, c) => {
        if (nativeClientOrigins.has(origin)) return origin;

        const allowed = configuredOrigins(c.env.TRUSTED_ORIGINS);
        const webOrigin = originFromPublicHost(c.env.WEB_PUBLIC_HOST);
        const apiOrigin = originFromPublicHost(c.env.API_PUBLIC_HOST);

        if (webOrigin) allowed.add(webOrigin);
        if (apiOrigin) allowed.add(apiOrigin);

        return allowed.has(origin) ? origin : null;
      },
      credentials: true,
    }),
  );
  app.use("*", errorHandler);
  app.use("*", bootstrap);
  return app;
};
