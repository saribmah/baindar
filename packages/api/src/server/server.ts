import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { AppEnv } from "../app/context";
import { Health } from "../health/health";
import { createAuth } from "../user/auth";
import aiRouter from "./routes/ai";
import billingRouter from "./routes/billing";
import conversationRouter from "./routes/conversation";
import documentRouter from "./routes/document";
import highlightRouter from "./routes/highlight";
import noteRouter from "./routes/note";
import profileRouter from "./routes/profile";
import providerRouter from "./routes/provider";
import shelfRouter from "./routes/shelf";
import testModeRouter from "./routes/test-mode";
import userRouter from "./routes/user";

const server = new Hono<AppEnv>();

// Better Auth's auto-generated routes (sign-in, sign-up, OAuth callbacks,
// email-OTP, sessions, …). basePath in createAuth() must match this prefix.
server.on(["GET", "POST"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// Mount feature routers here. Match feature path prefixes to feature names.
server.route("/ai", aiRouter);
server.route("/billing", billingRouter);
server.route("/conversations", conversationRouter);
server.route("/documents", documentRouter);
server.route("/highlights", highlightRouter);
server.route("/notes", noteRouter);
server.route("/shelves", shelfRouter);
server.route("/user", userRouter);
server.route("/profile", profileRouter);
server.route("/provider", providerRouter);
// Test-mode endpoints are always mounted but each handler 404s unless
// `TEST_MODE=true` is set on the env (only the local `dev:test` script does).
server.route("/__test__", testModeRouter);

server.get(
  "/health",
  describeRoute({
    summary: "Health check",
    description: "Check if the service is healthy.",
    operationId: "health.get",
    responses: {
      200: {
        description: "Service health status",
        content: {
          "application/json": {
            schema: resolver(Health.Response),
          },
        },
      },
    },
  }),
  (c) => {
    return c.json({
      status: "healthy",
    });
  },
);

export default server;
