import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";
import { requireByokPlan } from "../../middleware/byok-plan";
import { Provider } from "../../provider/provider";
import { createErrorMapper } from "../error-mapper";

const providerRouter = new Hono<AppEnv>();

const errorMappings = [
  { error: Provider.InvalidKeyError, status: 400 as const },
  { error: Provider.NotConfiguredError, status: 404 as const },
];

providerRouter.get(
  "/me",
  describeRoute({
    summary: "Get the caller's AI provider settings",
    description:
      "Returns `{ configured: false, settings: null }` when the user has no provider on file, or `{ configured: true, settings }` with the spec, base URL, model, and the last 4 characters of the API key. The key itself is never returned.",
    operationId: "provider.me",
    responses: {
      200: {
        description: "Provider status",
        content: { "application/json": { schema: resolver(Provider.StatusResponse) } },
      },
      401: { description: "Not authenticated" },
      403: { description: "BYOK plan required" },
    },
  }),
  requireAuth,
  requireByokPlan,
  async (c) => {
    const status = await Provider.get(Instance.userId);
    return c.json(status);
  },
);

providerRouter.put(
  "/me",
  describeRoute({
    summary: "Set the caller's AI provider settings",
    description:
      "Validates the supplied API key by issuing a 1-token completion against the provider, then encrypts and stores it. Subsequent chat turns will use this key + base URL + model instead of the platform key. Returns the sanitized entity (no decrypted key).",
    operationId: "provider.set",
    responses: {
      200: {
        description: "Saved",
        content: { "application/json": { schema: resolver(Provider.Entity) } },
      },
      400: { description: "Invalid input or provider rejected the key" },
      401: { description: "Not authenticated" },
      403: { description: "BYOK plan required" },
    },
  }),
  requireAuth,
  requireByokPlan,
  validator("json", Provider.SetInput),
  async (c) => {
    const body = c.req.valid("json");
    const mapError = createErrorMapper(errorMappings);
    try {
      const entity = await Provider.set({ userId: Instance.userId, ...body });
      return c.json(entity);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

providerRouter.delete(
  "/me",
  describeRoute({
    summary: "Remove the caller's AI provider settings",
    description:
      "Deletes the user's stored provider configuration. Subsequent chat turns fall back to the platform key (subject to the user's plan quota) — but BYOK-plan users will be required to re-add a key before chatting (see 428 from the chat route).",
    operationId: "provider.remove",
    responses: {
      204: { description: "Removed" },
      401: { description: "Not authenticated" },
      403: { description: "BYOK plan required" },
    },
  }),
  requireAuth,
  requireByokPlan,
  async (c) => {
    await Provider.remove(Instance.userId);
    return c.body(null, 204);
  },
);

export default providerRouter;
