import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { AccountDeletion } from "../../account-deletion/account-deletion";
import type { AppEnv } from "../../app/context";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";
import { createErrorMapper } from "../error-mapper";

const accountRouter = new Hono<AppEnv>();

accountRouter.delete(
  "/",
  describeRoute({
    summary: "Delete the authenticated account",
    description:
      "Permanently deletes the caller's account. Returns 202 once the DELETE_USER workflow has been durably enqueued and the caller's active sessions have been revoked. Background cleanup tears down per-document and per-conversation Durable Objects, sweeps R2 storage, and drops the auth row (D1 cascades sessions, accounts, profile, billing, usage, and provider settings). The operation cannot be undone.",
    operationId: "account.delete",
    responses: {
      202: {
        description: "Account deletion accepted",
        content: { "application/json": { schema: resolver(AccountDeletion.Response) } },
      },
      401: { description: "Not authenticated" },
      500: { description: "Workflow binding not configured" },
    },
  }),
  requireAuth,
  async (c) => {
    const mapError = createErrorMapper([
      { error: AccountDeletion.WorkflowNotConfiguredError, status: 500 as const },
    ]);
    try {
      const result = await AccountDeletion.request(Instance.userId);
      return c.json(result, 202);
    } catch (error) {
      const mapped = mapError(error);
      if (!mapped) throw error;
      return c.json(mapped.payload, mapped.status);
    }
  },
);

export default accountRouter;
