import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Conversation } from "../../conversation/conversation";
import { Document } from "../../document/document";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";
import { createErrorMapper } from "../error-mapper";

const conversationRouter = new Hono<AppEnv>();

const errorMappings = [
  { error: Conversation.NotFoundError, status: 404 as const },
  { error: Document.NotFoundError, status: 404 as const },
];

conversationRouter.post(
  "/",
  describeRoute({
    summary: "Create a conversation",
    description:
      "Creates a chat thread owned by the caller. With `primaryDocId` set, the conversation is tagged as 'started from this document' (used for reader-side resume lookups and sidebar badging). Without it, the conversation is unscoped. Title defaults to 'Untitled' when omitted.",
    operationId: "conversation.create",
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: resolver(Conversation.Entity) } },
      },
      400: { description: "Invalid input" },
      401: { description: "Not authenticated" },
      404: { description: "Primary document not found" },
    },
  }),
  requireAuth,
  validator("json", Conversation.CreateInput),
  async (c) => {
    const body = c.req.valid("json");
    const mapError = createErrorMapper(errorMappings);
    try {
      const entity = await Conversation.create(Instance.userId, body);
      return c.json(entity, 201);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

conversationRouter.get(
  "/",
  describeRoute({
    summary: "List the caller's conversations",
    description: "Returns conversations owned by the caller, ordered by most recent activity.",
    operationId: "conversation.list",
    responses: {
      200: {
        description: "Conversations",
        content: { "application/json": { schema: resolver(Conversation.ListResponse) } },
      },
      401: { description: "Not authenticated" },
    },
  }),
  requireAuth,
  async (c) => {
    const items = await Conversation.list(Instance.userId);
    return c.json({ items });
  },
);

conversationRouter.get(
  "/:id",
  describeRoute({
    summary: "Get a single conversation",
    operationId: "conversation.get",
    responses: {
      200: {
        description: "Conversation",
        content: { "application/json": { schema: resolver(Conversation.Entity) } },
      },
      401: { description: "Not authenticated" },
      404: { description: "Conversation not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper(errorMappings);
    try {
      const entity = await Conversation.get(Instance.userId, id);
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

conversationRouter.patch(
  "/:id",
  describeRoute({
    summary: "Rename a conversation",
    description: "Updates the conversation title. `primaryDocId` is immutable after create.",
    operationId: "conversation.update",
    responses: {
      200: {
        description: "Updated",
        content: { "application/json": { schema: resolver(Conversation.Entity) } },
      },
      400: { description: "Invalid input" },
      401: { description: "Not authenticated" },
      404: { description: "Conversation not found" },
    },
  }),
  requireAuth,
  validator("json", Conversation.UpdateInput),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const mapError = createErrorMapper(errorMappings);
    try {
      const entity = await Conversation.update(Instance.userId, id, body);
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

conversationRouter.delete(
  "/:id",
  describeRoute({
    summary: "Delete a conversation",
    operationId: "conversation.delete",
    responses: {
      204: { description: "Deleted" },
      401: { description: "Not authenticated" },
      404: { description: "Conversation not found" },
    },
  }),
  requireAuth,
  async (c) => {
    const id = c.req.param("id");
    const mapError = createErrorMapper(errorMappings);
    try {
      await Conversation.remove(Instance.userId, id);
      return c.body(null, 204);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

export default conversationRouter;
