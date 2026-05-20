import { z } from "zod";
import { Config } from "../config/config";
import { Provider } from "../provider/provider";
import { NamedError } from "../utils/error";
import { BillingStore } from "./billing-store";
import { RevenueCat } from "./revenuecat";

// Billing namespace: subscription state + AI usage metering. The provider
// (RevenueCat) is the source of truth for "what plan is this user on";
// `subscription` mirrors RC's view via the webhook + sync path. Quota math,
// usage metering, and period boundaries are provider-agnostic.
export namespace Billing {
  export const Plan = z.enum(["free", "personal", "pro", "byok"]).meta({ ref: "BillingPlan" });
  export type Plan = z.infer<typeof Plan>;

  export const SubscriptionStatus = z
    .enum(["active", "trialing", "past_due", "canceled", "incomplete"])
    .meta({ ref: "BillingSubscriptionStatus" });
  export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

  export const UsageKind = z
    .enum(["chat", "summary", "document"])
    .meta({ ref: "BillingUsageKind" });
  export type UsageKind = z.infer<typeof UsageKind>;

  // Per-plan caps. Numbers match the approved plan doc (Free/Personal/Pro/BYOK).
  // -1 means "no cap" (BYOK; abuse ceiling enforced separately in Phase 3+).
  export const Quota = z
    .object({
      chatTurnsLimit: z.number().int(),
      summariesLimit: z.number().int(),
      documentsLimit: z.number().int(),
    })
    .meta({ ref: "BillingQuota" });
  export type Quota = z.infer<typeof Quota>;

  const QUOTA_BY_PLAN: Record<Plan, Quota> = {
    free: { chatTurnsLimit: 30, summariesLimit: 20, documentsLimit: 5 },
    personal: { chatTurnsLimit: 300, summariesLimit: 200, documentsLimit: 50 },
    pro: { chatTurnsLimit: 1000, summariesLimit: 1000, documentsLimit: 500 },
    byok: { chatTurnsLimit: -1, summariesLimit: -1, documentsLimit: -1 },
  };

  export const getQuotaForPlan = (plan: Plan): Quota => QUOTA_BY_PLAN[plan];

  // Anthropic Claude Sonnet pricing as of 2026-05. Per-million-token rates,
  // expressed as micros (1 USD = 1_000_000 micros) so cost math stays in
  // integer space. Update these when the model or pricing changes — they are
  // the only place the per-token rate is encoded.
  const INPUT_MICROS_PER_TOKEN = 3; // $3 / 1M tokens
  const OUTPUT_MICROS_PER_TOKEN = 15; // $15 / 1M tokens

  export const estimateCostMicros = (inputTokens: number, outputTokens: number): number =>
    inputTokens * INPUT_MICROS_PER_TOKEN + outputTokens * OUTPUT_MICROS_PER_TOKEN;

  export const Subscription = {
    Entity: z
      .object({
        userId: z.string(),
        plan: Plan,
        status: SubscriptionStatus,
        providerCustomerId: z.string().nullable(),
        providerSubscriptionId: z.string().nullable(),
        currentPeriodStart: z.string().nullable(),
        currentPeriodEnd: z.string().nullable(),
        cancelAtPeriodEnd: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
      .meta({ ref: "BillingSubscription" }),
  };
  export type Subscription = z.infer<typeof Subscription.Entity>;

  export const UsagePeriod = {
    Entity: z
      .object({
        userId: z.string(),
        periodStart: z.string(),
        periodEnd: z.string(),
        chatTurns: z.number().int(),
        summaries: z.number().int(),
        inputTokens: z.number().int(),
        outputTokens: z.number().int(),
        costUsdMicros: z.number().int(),
      })
      .meta({ ref: "BillingUsagePeriod" }),
  };
  export type UsagePeriod = z.infer<typeof UsagePeriod.Entity>;

  export const StatusResponse = z
    .object({
      plan: Plan,
      status: SubscriptionStatus,
      quota: Quota,
      currentPeriod: UsagePeriod.Entity,
      periodResetAt: z.string(),
      cancelAtPeriodEnd: z.boolean(),
      // Plans the user can switch to (everything other than their current
      // plan). The client uses these to look up the matching RC offering
      // package via the RC SDK; the server no longer builds checkout URLs
      // since RC drives purchase entirely from the client SDK.
      availablePlans: z.array(Plan),
      // True when the user has configured a BYOK provider. Drives the
      // "AI Provider" row visibility / state on the billing page.
      // Clients obtain the manage-subscription URL directly from the RC
      // SDK's CustomerInfo (web: management_url; mobile: native UI),
      // so the server doesn't surface it.
      providerConfigured: z.boolean(),
    })
    .meta({ ref: "BillingStatus" });
  export type StatusResponse = z.infer<typeof StatusResponse>;

  // ---- Errors -----------------------------------------------------------
  export const QuotaExceededError = NamedError.create(
    "BillingQuotaExceededError",
    z.object({
      kind: UsageKind,
      plan: Plan,
      limit: z.number().int(),
      used: z.number().int(),
      periodResetAt: z.string(),
      message: z.string().optional(),
    }),
  );
  export type QuotaExceededError = InstanceType<typeof QuotaExceededError>;

  export const InvalidPlanError = NamedError.create(
    "BillingInvalidPlanError",
    z.object({ raw: z.string(), message: z.string().optional() }),
  );
  export type InvalidPlanError = InstanceType<typeof InvalidPlanError>;

  // ---- Period helpers ---------------------------------------------------
  // Monthly windows in UTC. A user's billing period rolls over at the start
  // of each calendar month — simple, predictable, matches how non-tech users
  // think about "this month's usage." Later we can shift this to anchor on
  // the subscription start date if RC's subscription cycle differs.
  export const getCurrentPeriodWindow = (now: Date = new Date()): { start: Date; end: Date } => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return { start, end };
  };

  // ---- Public API -------------------------------------------------------
  export const getSubscription = async (userId: string): Promise<Subscription> => {
    return BillingStore.getOrCreateSubscription(userId);
  };

  export const getCurrentPeriod = async (userId: string): Promise<UsagePeriod> => {
    const window = getCurrentPeriodWindow();
    return BillingStore.getOrCreateUsagePeriod(userId, window.start, window.end);
  };

  export const getStatus = async (userId: string): Promise<StatusResponse> => {
    const [subscription, period, providerConfigured] = await Promise.all([
      getSubscription(userId),
      getCurrentPeriod(userId),
      Provider.hasConfigured(userId).catch(() => false),
    ]);
    const quota = getQuotaForPlan(subscription.plan);
    const availablePlans = (["personal", "pro", "byok"] as Plan[]).filter(
      (p) => p !== subscription.plan,
    );
    return {
      plan: subscription.plan,
      status: subscription.status,
      quota,
      currentPeriod: period,
      periodResetAt: period.periodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      availablePlans,
      providerConfigured,
    };
  };

  // Remaining quota for the active period. A value of -1 means "unlimited"
  // and should be rendered as such by callers. Used by Phase 3 enforcement
  // middleware; included now so the shape is locked before any UI starts
  // depending on it.
  export type Remaining = {
    chatTurns: number;
    summaries: number;
    plan: Plan;
    periodResetAt: string;
  };

  export const getRemainingQuota = async (userId: string): Promise<Remaining> => {
    const status = await getStatus(userId);
    const remaining = (limit: number, used: number): number =>
      limit < 0 ? -1 : Math.max(0, limit - used);
    return {
      chatTurns: remaining(status.quota.chatTurnsLimit, status.currentPeriod.chatTurns),
      summaries: remaining(status.quota.summariesLimit, status.currentPeriod.summaries),
      plan: status.plan,
      periodResetAt: status.periodResetAt,
    };
  };

  // ---- Access evaluation ------------------------------------------------
  // Shared policy helpers used by both HTTP middleware and the WS-bound
  // ChatAgent. Returning a discriminated result (instead of throwing or
  // shaping an HTTP response) lets the two callers compose the result into
  // their own response type — `c.json(...)` in middleware, `new Response(...)`
  // inside the Durable Object.
  export type AccessDenial =
    | {
        status: 402;
        payload: {
          name: "BillingQuotaExceededError";
          data: {
            kind: UsageKind;
            plan: Plan;
            limit: number;
            used: number;
            periodResetAt: string;
            message: string;
          };
        };
      }
    | {
        status: 428;
        payload: {
          name: "ProviderNotConfiguredError";
          data: { kind: UsageKind; plan: Plan; message: string };
        };
      };
  export type AccessResult = { ok: true } | ({ ok: false } & AccessDenial);

  const buildQuotaDenial = (
    kind: UsageKind,
    plan: Plan,
    limit: number,
    used: number,
    periodResetAt: string,
  ): AccessDenial => ({
    status: 402,
    payload: {
      name: "BillingQuotaExceededError",
      data: {
        kind,
        plan,
        limit,
        used,
        periodResetAt,
        message: `Out of ${kind} quota for this period — upgrade to continue.`,
      },
    },
  });

  // Chat access. BYOK earns unlimited turns only when the user has actually
  // configured a provider — otherwise we'd hand out the platform key for
  // free. Used by `requireChatQuota` middleware (gates WS upgrade) AND
  // `ChatAgent.onChatMessage` (gates each turn on an already-open WS).
  export const evaluateChatAccess = async (userId: string): Promise<AccessResult> => {
    const status = await getStatus(userId);
    const limit = status.quota.chatTurnsLimit;
    if (limit < 0) {
      const hasProvider = await Provider.hasConfigured(userId);
      if (!hasProvider) {
        return {
          ok: false,
          status: 428,
          payload: {
            name: "ProviderNotConfiguredError",
            data: {
              kind: "chat",
              plan: status.plan,
              message: "BYOK plan requires an AI provider key. Add one in Settings → AI Provider.",
            },
          },
        };
      }
      return { ok: true };
    }
    const used = status.currentPeriod.chatTurns;
    if (used >= limit) {
      return {
        ok: false,
        ...buildQuotaDenial("chat", status.plan, limit, used, status.periodResetAt),
      };
    }
    return { ok: true };
  };

  // Document access. Count-based — the caller supplies the user's current
  // document row count rather than us reaching into Document storage from
  // Billing (would create a circular dependency).
  export const evaluateDocumentAccess = async (
    userId: string,
    currentCount: number,
  ): Promise<AccessResult> => {
    const status = await getStatus(userId);
    const limit = status.quota.documentsLimit;
    if (limit < 0) return { ok: true };
    if (currentCount >= limit) {
      return {
        ok: false,
        ...buildQuotaDenial("document", status.plan, limit, currentCount, status.periodResetAt),
      };
    }
    return { ok: true };
  };

  // ---- RevenueCat integration ------------------------------------------

  // A normalised projection of an RC V2 Customer "active entitlements"
  // response. The webhook handler treats RC events as a "ping" — it
  // re-fetches this snapshot and writes it, which keeps the upsert path
  // the single source of truth and immune to event-ordering bugs.
  export type RevenueCatSubscriberSnapshot = {
    appUserId: string;
    customerId: string;
    activeEntitlements: ReadonlyArray<{
      entitlementId: string;
      productId: string;
      expiresAt: Date | null;
      willRenew: boolean;
      store: string;
    }>;
    managementUrl: string | null;
  };

  // Plan priority for the (rare) case where a user has multiple active
  // entitlements at once — pick the highest-value plan so we never
  // accidentally downgrade them. BYOK is intentionally last: it provides
  // unlimited quota but only when a provider key is configured, so a
  // user holding both a metered paid plan AND BYOK is better served by
  // the metered plan's billing surface.
  const PLAN_PRIORITY: Record<Plan, number> = {
    pro: 3,
    personal: 2,
    byok: 1,
    free: 0,
  };

  // Upserts the subscription row from an RC subscriber snapshot. Resolves
  // the highest-priority active entitlement → plan; absence of any active
  // entitlement downgrades the user to free at the moment the snapshot is
  // applied (RC keeps entitlements active through any configured grace
  // period, so this firing means access has truly lapsed).
  export const applyRevenueCatSnapshot = async (
    snapshot: RevenueCatSubscriberSnapshot,
  ): Promise<void> => {
    let bestPlan: Plan = "free";
    let bestPriority = -1;
    let bestProductId: string | null = null;
    let bestWillRenew = true;
    let bestExpiresAt: Date | null = null;

    for (const entitlement of snapshot.activeEntitlements) {
      const plan = Config.getRevenueCatPlanForEntitlement(entitlement.entitlementId);
      if (!plan) {
        console.warn(
          "[billing] revenuecat snapshot references unknown entitlement, ignoring",
          entitlement.entitlementId,
        );
        continue;
      }
      const priority = PLAN_PRIORITY[plan];
      if (priority > bestPriority) {
        bestPlan = plan;
        bestPriority = priority;
        bestProductId = entitlement.productId || null;
        bestWillRenew = entitlement.willRenew;
        bestExpiresAt = entitlement.expiresAt;
      }
    }

    const hasActive = bestPriority >= 0;
    await BillingStore.upsertSubscriptionFromRevenueCat({
      userId: snapshot.appUserId,
      plan: hasActive ? bestPlan : "free",
      status: "active",
      providerCustomerId: hasActive ? snapshot.customerId : null,
      providerSubscriptionId: hasActive ? bestProductId : null,
      currentPeriodStart: null,
      currentPeriodEnd: hasActive ? bestExpiresAt : null,
      cancelAtPeriodEnd: hasActive ? !bestWillRenew : false,
    });
  };

  // Network-touching helper: fetches the current snapshot from RC and
  // applies it. Used by the webhook handler (where the payload tells us
  // who to fetch) and by the `POST /billing/sync` route (which clients
  // call right after a successful purchase to refresh status without
  // waiting for the webhook to arrive).
  export const syncFromRevenueCat = async (userId: string): Promise<void> => {
    const snapshot = await RevenueCat.fetchSubscriber(userId);
    await applyRevenueCatSnapshot(snapshot);
  };

  export type RecordUsageInput = {
    userId: string;
    kind: UsageKind;
    inputTokens: number;
    outputTokens: number;
    byok?: boolean;
    sourceId?: string | null;
  };

  // Append-only metering. Writes a UsageEvent ledger row and, when the
  // event counts against the user's quota (i.e. not BYOK), increments the
  // current UsagePeriod's counters in the same transaction. Cost is always
  // recorded — BYOK events get a cost so the user's own usage UI can show
  // them what they would have paid.
  export const recordUsage = async (input: RecordUsageInput): Promise<void> => {
    const byok = input.byok === true;
    const costUsdMicros = estimateCostMicros(input.inputTokens, input.outputTokens);
    const window = getCurrentPeriodWindow();
    await BillingStore.appendUsageEvent(
      {
        id: crypto.randomUUID(),
        userId: input.userId,
        kind: input.kind,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsdMicros,
        byok,
        sourceId: input.sourceId ?? null,
        createdAt: new Date(),
      },
      byok ? null : { periodStart: window.start, periodEnd: window.end, kind: input.kind },
    );
  };
}
