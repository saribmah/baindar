import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { requireOwnAgentInstance } from "../middleware/agent-instance";
import { requireAuth } from "../middleware/auth";
import { requireChatQuota } from "../middleware/quota";
import server from "../server/server";
import type { AppEnv } from "./context";
import { withBase } from "./with-base";

// Lazy-load `hono-agents` so the OpenAPI generator (which imports devApp at
// module load) doesn't pull in the `agents` package — that package imports
// `cloudflare:email`, which only resolves inside the workerd runtime, not
// in the plain Bun script that runs `openapi:generate`.
let agentsHandler: Promise<MiddlewareHandler> | null = null;
const agentsLazy: MiddlewareHandler = async (c, next) => {
  if (!agentsHandler) {
    agentsHandler = import("hono-agents").then((m) => m.agentsMiddleware());
  }
  return (await agentsHandler)(c, next);
};

export const openApiDocumentation = {
  info: {
    title: "baindar API",
    version: "0.0.0",
    description: "baindar API OpenAPI schema",
  },
  components: {
    securitySchemes: {
      // Browsers send the cookie automatically; non-browser callers send the
      // same session token via Authorization: Bearer <token> (Better Auth's
      // bearer plugin). Either is sufficient for routes behind requireAuth.
      sessionCookie: {
        type: "apiKey" as const,
        in: "cookie" as const,
        name: "better-auth.session_token",
      },
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer" as const,
      },
    },
  },
};

// API app, reached on `api.*` in production. Mounts the server router at root
// and exposes the OpenAPI document.
export const apiApp = withBase(new Hono<AppEnv>());
// Cloudflare Agents — handles WebSocket upgrades and HTTP requests routed to
// `/agents/:agent/:instance/*`. Must run before the catch-all server router.
apiApp.use("/agents/*", requireAuth, requireOwnAgentInstance, requireChatQuota, agentsLazy);
apiApp.route("/", server);
apiApp.get("/openapi.json", openAPIRouteHandler(apiApp, { documentation: openApiDocumentation }));

// Dev / fallback composite. Used by `wrangler dev` and by the default
// `*.workers.dev` hostname when custom-domain subdomains aren't attached yet.
export const devApp = withBase(new Hono<AppEnv>());
devApp.use("/agents/*", requireAuth, requireOwnAgentInstance, requireChatQuota, agentsLazy);
devApp.route("/", server);
devApp.get("/openapi.json", openAPIRouteHandler(devApp, { documentation: openApiDocumentation }));
