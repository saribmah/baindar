import { and, eq, sql } from "drizzle-orm";
import { subscription, usageEvent, usagePeriod } from "../db/schema";
import { Instance } from "../instance";
import { Billing } from "./billing";

// BillingStore: only persistence. Business logic (quota math, period
// boundaries, cost rates) lives in `billing.ts`. The store narrows raw
// strings ("free", "active") back to the typed Plan / SubscriptionStatus
// via parse-with-fallback so a corrupted row never crashes the entire
// billing read path — we degrade to the safe default instead.
export namespace BillingStore {
  // ---- Subscription -----------------------------------------------------
  export const subscriptionSelect = {
    userId: subscription.userId,
    plan: subscription.plan,
    status: subscription.status,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  } as const;

  export type SubscriptionRow = {
    userId: string;
    plan: string;
    status: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

  const parsePlan = (raw: string): Billing.Plan => {
    const parsed = Billing.Plan.safeParse(raw);
    return parsed.success ? parsed.data : "free";
  };

  const parseStatus = (raw: string): Billing.SubscriptionStatus => {
    const parsed = Billing.SubscriptionStatus.safeParse(raw);
    return parsed.success ? parsed.data : "active";
  };

  export const toSubscription = (row: SubscriptionRow): Billing.Subscription => ({
    userId: row.userId,
    plan: parsePlan(row.plan),
    status: parseStatus(row.status),
    providerCustomerId: row.providerCustomerId,
    providerSubscriptionId: row.providerSubscriptionId,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  export const getSubscription = async (userId: string): Promise<Billing.Subscription | null> => {
    const rows = await Instance.db
      .select(subscriptionSelect)
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? toSubscription(row) : null;
  };

  // Lazy-create: every signed-in user has an implicit `free` subscription.
  // We materialize the row the first time billing state is observed so
  // downstream queries (period rollup, webhook reconciliation) can rely on
  // its presence. `onConflictDoNothing + re-read` handles the race where
  // two concurrent requests both try to seed.
  export const getOrCreateSubscription = async (userId: string): Promise<Billing.Subscription> => {
    const existing = await getSubscription(userId);
    if (existing) return existing;
    const now = new Date();
    const rows = await Instance.db
      .insert(subscription)
      .values({
        userId,
        plan: "free",
        status: "active",
        providerCustomerId: null,
        providerSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(subscriptionSelect);
    const row = rows[0];
    if (row) return toSubscription(row);
    const raced = await getSubscription(userId);
    if (!raced) {
      throw new Error("BillingStore.getOrCreateSubscription: row missing after insert race");
    }
    return raced;
  };

  // Idempotent upsert from a Polar subscription event. The Better Auth Polar
  // plugin uses `externalId === user.id`, so the webhook callback can pass
  // the user id directly. Always overwrites plan/status/period fields — the
  // webhook is authoritative for what Polar believes the subscription state
  // to be. Re-deliveries of the same event are safe (last-write-wins on a
  // unique row).
  export const upsertSubscriptionFromPolar = async (input: {
    userId: string;
    plan: Billing.Plan;
    status: Billing.SubscriptionStatus;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }): Promise<void> => {
    const now = new Date();
    await Instance.db
      .insert(subscription)
      .values({
        userId: input.userId,
        plan: input.plan,
        status: input.status,
        providerCustomerId: input.providerCustomerId,
        providerSubscriptionId: input.providerSubscriptionId,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscription.userId,
        set: {
          plan: input.plan,
          status: input.status,
          providerCustomerId: input.providerCustomerId,
          providerSubscriptionId: input.providerSubscriptionId,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          updatedAt: now,
        },
      });
  };

  // ---- UsagePeriod ------------------------------------------------------
  export const usagePeriodSelect = {
    userId: usagePeriod.userId,
    periodStart: usagePeriod.periodStart,
    periodEnd: usagePeriod.periodEnd,
    chatTurns: usagePeriod.chatTurns,
    summaries: usagePeriod.summaries,
    inputTokens: usagePeriod.inputTokens,
    outputTokens: usagePeriod.outputTokens,
    costUsdMicros: usagePeriod.costUsdMicros,
    createdAt: usagePeriod.createdAt,
    updatedAt: usagePeriod.updatedAt,
  } as const;

  export type UsagePeriodRow = {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    chatTurns: number;
    summaries: number;
    inputTokens: number;
    outputTokens: number;
    costUsdMicros: number;
    createdAt: Date;
    updatedAt: Date;
  };

  export const toUsagePeriod = (row: UsagePeriodRow): Billing.UsagePeriod => ({
    userId: row.userId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    chatTurns: row.chatTurns,
    summaries: row.summaries,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsdMicros: row.costUsdMicros,
  });

  export const getOrCreateUsagePeriod = async (
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Billing.UsagePeriod> => {
    const existing = await Instance.db
      .select(usagePeriodSelect)
      .from(usagePeriod)
      .where(and(eq(usagePeriod.userId, userId), eq(usagePeriod.periodStart, periodStart)))
      .limit(1);
    if (existing[0]) return toUsagePeriod(existing[0]);

    const now = new Date();
    const inserted = await Instance.db
      .insert(usagePeriod)
      .values({
        userId,
        periodStart,
        periodEnd,
        chatTurns: 0,
        summaries: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsdMicros: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(usagePeriodSelect);
    if (inserted[0]) return toUsagePeriod(inserted[0]);

    // Race: another caller seeded the row first. Read it back.
    const raced = await Instance.db
      .select(usagePeriodSelect)
      .from(usagePeriod)
      .where(and(eq(usagePeriod.userId, userId), eq(usagePeriod.periodStart, periodStart)))
      .limit(1);
    if (!raced[0]) {
      throw new Error("BillingStore.getOrCreateUsagePeriod: row missing after insert race");
    }
    return toUsagePeriod(raced[0]);
  };

  // ---- UsageEvent + rollup ---------------------------------------------
  export type UsageEventInsert = {
    id: string;
    userId: string;
    kind: Billing.UsageKind;
    inputTokens: number;
    outputTokens: number;
    costUsdMicros: number;
    byok: boolean;
    sourceId: string | null;
    createdAt: Date;
  };

  export type RollupTarget = {
    periodStart: Date;
    periodEnd: Date;
    kind: Billing.UsageKind;
  };

  // Two writes: append the ledger row, then (when this event counts against
  // quota) increment the matching UsagePeriod's counters. We ensure the
  // period row exists first to avoid a missed update. D1 doesn't expose
  // transactions across multiple statements, so the two writes are best-
  // effort sequential — the ledger row is the source of truth and can be
  // used to reconstruct period totals if a rollup write drops.
  export const appendUsageEvent = async (
    event: UsageEventInsert,
    rollup: RollupTarget | null,
  ): Promise<void> => {
    await Instance.db.insert(usageEvent).values({
      id: event.id,
      userId: event.userId,
      kind: event.kind,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      costUsdMicros: event.costUsdMicros,
      byok: event.byok,
      sourceId: event.sourceId,
      createdAt: event.createdAt,
    });

    if (!rollup) return;

    await getOrCreateUsagePeriod(event.userId, rollup.periodStart, rollup.periodEnd);

    const kindIncrement =
      rollup.kind === "chat"
        ? { chatTurns: sql`${usagePeriod.chatTurns} + 1` }
        : { summaries: sql`${usagePeriod.summaries} + 1` };

    await Instance.db
      .update(usagePeriod)
      .set({
        ...kindIncrement,
        inputTokens: sql`${usagePeriod.inputTokens} + ${event.inputTokens}`,
        outputTokens: sql`${usagePeriod.outputTokens} + ${event.outputTokens}`,
        costUsdMicros: sql`${usagePeriod.costUsdMicros} + ${event.costUsdMicros}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(usagePeriod.userId, event.userId), eq(usagePeriod.periodStart, rollup.periodStart)),
      );
  };
}
