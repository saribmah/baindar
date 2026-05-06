import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthContext } from "../app/context";
import { createDb } from "../db/db";
import { createAnonymousAuth } from "../middleware/auth";
import { createAuth } from "../user/auth";
import { Instance } from "./";

export const bootstrap = createMiddleware<AppEnv>(async (c, next) => {
  const db = createDb(c.env);
  const headers = headersWithWsToken(c.req.raw);
  const auth = await resolveAuthContext(headers, c.env);
  await Instance.provide({ auth, env: c.env, db }, async () => {
    await next();
  });
});

// Browsers and React Native expose no way to set Authorization on a WebSocket
// upgrade. Accept the session token via `?token=` on WS upgrades only — never
// on plain HTTP — and promote it to an Authorization header so Better Auth's
// `getSession` validates it the same way it validates the bearer plugin.
const headersWithWsToken = (req: Request): Headers => {
  const headers = new Headers(req.headers);
  if (headers.has("Authorization")) return headers;
  if ((headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") return headers;
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return headers;
  headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

const resolveAuthContext = async (
  headers: Headers,
  env: AppEnv["Bindings"],
): Promise<AuthContext> => {
  if (!env.BETTER_AUTH_SECRET) {
    return createAnonymousAuth();
  }
  try {
    const auth = createAuth(env);
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return createAnonymousAuth();
    return {
      isAuthenticated: true,
      userId: session.user.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        emailVerified: session.user.emailVerified,
        image: session.user.image ?? null,
      },
      authMethod: "session",
    };
  } catch {
    return createAnonymousAuth();
  }
};
