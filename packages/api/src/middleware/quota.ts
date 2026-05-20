import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app/context";
import { Billing } from "../billing/billing";
import { Document } from "../document/document";
import { Instance } from "../instance";
import { Provider } from "../provider/provider";

// Quota enforcement middleware. Runs after requireAuth so Instance.userId is
// always populated.
//
// Returns the typed 402 / 428 payload directly rather than throwing, because
// the chat middleware chain in app.ts has no error-mapper wrapper. The payload
// carries everything the frontend needs to render the upgrade dialog (plan,
// periodResetAt) without a second roundtrip.
//
// Chat is doubly enforced: this middleware gates the WS upgrade, but the
// `/agents/*` WebSocket stays open for many messages once handshake-time
// quota passes — `ChatAgent.onChatMessage` runs the same Billing helper on
// every message so a long-lived WS cannot outrun the user's plan. See
// `agent/chat.ts`.

export const requireChatQuota: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await Billing.evaluateChatAccess(Instance.userId);
  if (!result.ok) return c.json(result.payload, result.status);
  await next();
};

// Documents are count-based (lifetime, not per-period). The Document store
// owns the canonical count; Billing evaluates the limit. Free: 5, Personal:
// 50, Pro: 500, BYOK: unlimited.
export const requireDocumentQuota: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = Instance.userId;
  const currentCount = await Document.countOwned(userId);
  const result = await Billing.evaluateDocumentAccess(userId, currentCount);
  if (!result.ok) return c.json(result.payload, result.status);
  await next();
};

// Summary is the legacy period-based path; chat moved to evaluateChatAccess
// because it needs to be reusable from inside the WS. Kept inline here
// because the summarize route is HTTP-only and doesn't share with the agent.
export const requireSummarizeQuota: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = Instance.userId;
  const status = await Billing.getStatus(userId);
  const limit = status.quota.summariesLimit;
  if (limit < 0) {
    const hasProvider = await Provider.hasConfigured(userId);
    if (!hasProvider) {
      return c.json(
        {
          name: "ProviderNotConfiguredError",
          data: {
            kind: "summary" as const,
            plan: status.plan,
            message: "BYOK plan requires an AI provider key. Add one in Settings → AI Provider.",
          },
        },
        428,
      );
    }
    await next();
    return;
  }
  const used = status.currentPeriod.summaries;
  if (used >= limit) {
    return c.json(
      {
        name: "BillingQuotaExceededError",
        data: {
          kind: "summary" as const,
          plan: status.plan,
          limit,
          used,
          periodResetAt: status.periodResetAt,
          message: "Out of summary quota for this period — upgrade to continue.",
        },
      },
      402,
    );
  }
  await next();
};
