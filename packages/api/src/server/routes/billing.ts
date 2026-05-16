import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Billing } from "../../billing/billing";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";

const billingRouter = new Hono<AppEnv>();

billingRouter.get(
  "/me",
  describeRoute({
    summary: "Get the caller's billing status",
    description:
      'Returns the caller\'s plan, subscription status, current-period usage, and quota limits. The Free plan is implicit — users without an explicit subscription row get `plan: "free", status: "active"`. `periodResetAt` is the ISO timestamp at which the current usage counters roll over (start of the next UTC calendar month in Phase 1).',
    operationId: "billing.me",
    responses: {
      200: {
        description: "Billing status",
        content: { "application/json": { schema: resolver(Billing.StatusResponse) } },
      },
      401: { description: "Not authenticated" },
    },
  }),
  requireAuth,
  async (c) => {
    const status = await Billing.getStatus(Instance.userId);
    return c.json(status);
  },
);

export default billingRouter;
