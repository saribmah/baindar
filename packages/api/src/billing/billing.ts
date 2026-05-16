import { z } from "zod";
import { Config } from "../config/config";
import { Provider } from "../provider/provider";
import { NamedError } from "../utils/error";
import { BillingStore } from "./billing-store";

// Billing namespace: subscription state + AI usage metering. Phase 1 is
// "metering only" — recordUsage writes ledger rows and rolls up monthly
// counters, but no caller enforces the quota yet. The quota math lives
// here so that when enforcement lands (Phase 3) the only new code is a
// middleware that calls `Billing.getRemainingQuota` and maps the result.
export namespace Billing {
  export const Plan = z.enum(["free", "personal", "pro", "byok"]).meta({ ref: "BillingPlan" });
  export type Plan = z.infer<typeof Plan>;

  export const SubscriptionStatus = z
    .enum(["active", "trialing", "past_due", "canceled", "incomplete"])
    .meta({ ref: "BillingSubscriptionStatus" });
  export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

  export const UsageKind = z.enum(["chat", "summary"]).meta({ ref: "BillingUsageKind" });
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

  export const UpgradeOption = z
    .object({
      plan: Plan,
      checkoutUrl: z.string(),
    })
    .meta({ ref: "BillingUpgradeOption" });
  export type UpgradeOption = z.infer<typeof UpgradeOption>;

  export const StatusResponse = z
    .object({
      plan: Plan,
      status: SubscriptionStatus,
      quota: Quota,
      currentPeriod: UsagePeriod.Entity,
      periodResetAt: z.string(),
      cancelAtPeriodEnd: z.boolean(),
      // Frontend-ready checkout + portal URLs derived from configured Polar
      // products. `upgradeOptions` lists plans the user can switch to (i.e.
      // not their current plan). `portalUrl` is null until Polar is fully
      // configured AND the user has a subscription record at Polar.
      upgradeOptions: z.array(UpgradeOption),
      portalUrl: z.string().nullable(),
      // True when the user has configured a BYOK provider. Drives the
      // "AI Provider" row visibility / state on the billing page.
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
  // the subscription start date if Polar's subscription cycle differs.
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
    const urls = buildUpgradeUrls(subscription.plan, subscription.providerSubscriptionId);
    return {
      plan: subscription.plan,
      status: subscription.status,
      quota,
      currentPeriod: period,
      periodResetAt: period.periodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      upgradeOptions: urls.upgradeOptions,
      portalUrl: urls.portalUrl,
      providerConfigured,
    };
  };

  // Build the public-facing checkout + portal URLs from the configured
  // Polar products. Returns an empty list / null when Polar isn't wired
  // (local dev without credentials, OpenAPI codegen) so callers don't have
  // to special-case "is Polar configured" — they just render zero options.
  //
  // We compute these on the server so the frontend doesn't need to know
  // the API origin or the Polar plugin's URL conventions. If we move off
  // Polar later, the URL shape changes in exactly one place.
  const buildUpgradeUrls = (
    currentPlan: Plan,
    providerSubscriptionId: string | null,
  ): { upgradeOptions: UpgradeOption[]; portalUrl: string | null } => {
    const apiHost = Config.getApiPublicHost();
    const polar = Config.getPolar();
    if (!apiHost || !polar) {
      return { upgradeOptions: [], portalUrl: null };
    }
    const baseUrl = apiHost.replace(/\/$/, "");
    const products = Config.getPolarProducts();
    // Our own GET wrappers (`/api/billing/checkout/:plan`, `/api/billing/portal`)
    // do the POST to Polar internally and 302 the browser onward. We expose
    // GETs so web/desktop anchors + mobile `Linking.openURL` all work
    // identically without per-platform JS to wrangle a POST.
    const upgradeOptions = products
      .filter((p) => p.plan !== currentPlan)
      .map((p) => ({ plan: p.plan as Plan, checkoutUrl: `${baseUrl}/billing/checkout/${p.plan}` }));
    // Portal route only makes sense once the user has a real Polar
    // subscription on file. Free-plan users (no providerSubscriptionId)
    // have nothing to manage yet.
    const portalUrl = providerSubscriptionId ? `${baseUrl}/billing/portal` : null;
    return { upgradeOptions, portalUrl };
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

  // ---- Polar webhook integration ---------------------------------------

  // Minimal projection of a Polar subscription webhook payload. We only
  // touch fields needed to maintain our subscription row — the rest of
  // Polar's rich payload (line items, prices, addresses, …) is ignored.
  export type PolarSubscriptionEvent = {
    kind: "created" | "updated" | "canceled" | "uncanceled" | "active" | "revoked";
    subscriptionId: string;
    productId: string;
    externalUserId: string | null;
    customerId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  };

  // Upserts the subscription row from a Polar event. The product → plan
  // mapping is resolved via Config; an unknown product is logged + ignored
  // so a bad webhook can't corrupt the user's plan. `revoked` and `canceled`
  // both downgrade to free at period end (cancelAtPeriodEnd handles the
  // grace period; `revoked` arrives at the actual end-of-access moment).
  export const applyPolarEvent = async (event: PolarSubscriptionEvent): Promise<void> => {
    if (!event.externalUserId) {
      console.warn("[billing] polar event missing externalUserId", event.subscriptionId);
      return;
    }

    const isRevocation = event.kind === "canceled" || event.kind === "revoked";
    let plan: Plan;
    if (isRevocation && !event.cancelAtPeriodEnd) {
      // Hard cancellation already happened — downgrade now.
      plan = "free";
    } else {
      const mapped = Config.getPolarPlanForProduct(event.productId);
      if (!mapped) {
        console.warn(
          "[billing] polar event references unknown productId, ignoring",
          event.productId,
        );
        return;
      }
      plan = mapped;
    }

    await BillingStore.upsertSubscriptionFromPolar({
      userId: event.externalUserId,
      plan,
      status: event.status,
      providerCustomerId: event.customerId,
      providerSubscriptionId: event.subscriptionId,
      currentPeriodStart: event.currentPeriodStart,
      currentPeriodEnd: event.currentPeriodEnd,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    });
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
