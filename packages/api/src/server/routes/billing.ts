import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { AppEnv } from "../../app/context";
import { Billing } from "../../billing/billing";
import { RevenueCat } from "../../billing/revenuecat";
import { Config } from "../../config/config";
import { Instance } from "../../instance";
import { requireAuth } from "../../middleware/auth";

const billingRouter = new Hono<AppEnv>();

billingRouter.get(
  "/me",
  describeRoute({
    summary: "Get the caller's billing status",
    description:
      'Returns the caller\'s plan, subscription status, current-period usage, quota limits, and the list of plans they can switch to. The Free plan is implicit — users without an explicit subscription row get `plan: "free", status: "active"`. `periodResetAt` is the ISO timestamp at which the current usage counters roll over (start of the next UTC calendar month in Phase 1). Clients drive purchase and subscription management through their own RevenueCat SDKs; this endpoint surfaces only the server-side view of plan + quota.',
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

// Force a refresh of the caller's billing status from RevenueCat. Clients
// call this after a successful in-SDK purchase so the UI reflects the new
// plan immediately instead of waiting for the webhook to land (which can
// be seconds to minutes depending on provider load).
billingRouter.post(
  "/sync",
  describeRoute({
    summary: "Refresh billing status from RevenueCat",
    description:
      "Re-fetches the caller's active entitlements from RevenueCat and upserts the local subscription row. Returns the freshly recomputed billing status. Idempotent; safe to call after every purchase or restore.",
    operationId: "billing.sync",
    responses: {
      200: {
        description: "Refreshed billing status",
        content: { "application/json": { schema: resolver(Billing.StatusResponse) } },
      },
      401: { description: "Not authenticated" },
      500: { description: "RevenueCat not configured" },
    },
  }),
  requireAuth,
  async (c) => {
    if (!Config.getRevenueCat()) {
      return c.json({ error: "revenuecat_not_configured" }, 500);
    }
    await Billing.syncFromRevenueCat(Instance.userId);
    const status = await Billing.getStatus(Instance.userId);
    return c.json(status);
  },
);

// RevenueCat webhook receiver. RC fires every subscription lifecycle event
// (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, …) at this URL
// with an `Authorization` header whose value matches the shared secret
// configured in RC. We treat the event as a "ping": ignore the payload
// specifics, re-fetch the canonical subscriber state, and upsert. That
// keeps a single code path authoritative regardless of event type or
// ordering.
billingRouter.post(
  "/revenuecat/webhook",
  describeRoute({
    summary: "RevenueCat webhook receiver",
    description:
      "Handles RevenueCat subscription lifecycle webhooks. Requires the configured shared secret in the Authorization header; re-fetches the canonical subscriber state and upserts the local subscription row.",
    operationId: "billing.revenuecatWebhook",
    responses: {
      200: { description: "Event accepted" },
      401: { description: "Invalid or missing authorization header" },
      500: { description: "RevenueCat not configured" },
    },
  }),
  async (c) => {
    const config = Config.getRevenueCat();
    if (!config) {
      return c.json({ error: "revenuecat_not_configured" }, 500);
    }
    const header = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    if (!constantTimeEquals(header, config.webhookAuth)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const payload = await c.req.json().catch(() => null);
    const appUserId = RevenueCat.extractAppUserId(payload);
    if (!appUserId) {
      // Malformed payload — ack with 200 so RC doesn't retry forever, but
      // log loudly so we notice if this becomes common.
      console.warn("[billing] revenuecat webhook missing app_user_id");
      return c.json({ ok: true });
    }
    await Billing.syncFromRevenueCat(appUserId);
    return c.json({ ok: true });
  },
);

// Constant-time string comparison. Webhook auth is a shared secret; using
// a length-first short-circuit + char-by-char xor avoids leaking timing
// info to an attacker who can issue webhook calls.
const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

export default billingRouter;
