import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app/context";
import { Billing } from "../billing/billing";
import { Instance } from "../instance";

// Quota enforcement middleware. Runs after requireAuth so Instance.userId is
// always populated.
//
// Returns 402 Payment Required directly (mirroring `requireAuth`'s 401
// pattern) rather than throwing a typed error, because the chat middleware
// chain in app.ts has no error-mapper wrapper — middleware-thrown errors
// would bubble to Hono's default 500 handler. The 402 payload carries
// everything the frontend needs to render the upgrade dialog (plan,
// periodResetAt) without a second roundtrip.
//
// Critical placement: this MUST run BEFORE the request reaches the model.
// On chat, that means before agentsMiddleware fires the streamText call
// (see app.ts). On summarize, before Ai.summarize hits the LLM.

const checkQuota = (
  kind: Billing.UsageKind,
  pickRemaining: (remaining: Billing.Remaining) => number,
  pickLimit: (status: Billing.StatusResponse) => number,
): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const userId = Instance.userId;
    const status = await Billing.getStatus(userId);
    const limit = pickLimit(status);
    // limit < 0 means unlimited (BYOK); always allow.
    if (limit < 0) {
      await next();
      return;
    }
    const remaining = await Billing.getRemainingQuota(userId);
    if (pickRemaining(remaining) <= 0) {
      return c.json(
        {
          name: "BillingQuotaExceededError",
          data: {
            kind,
            plan: status.plan,
            limit,
            used: limit,
            periodResetAt: status.periodResetAt,
            message: `Out of ${kind} turns for this period — upgrade to continue.`,
          },
        },
        402,
      );
    }
    await next();
  };
};

export const requireChatQuota: MiddlewareHandler<AppEnv> = checkQuota(
  "chat",
  (r) => r.chatTurns,
  (s) => s.quota.chatTurnsLimit,
);

export const requireSummarizeQuota: MiddlewareHandler<AppEnv> = checkQuota(
  "summary",
  (r) => r.summaries,
  (s) => s.quota.summariesLimit,
);
