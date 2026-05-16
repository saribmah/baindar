import { BillingPlan } from "@baindar/sdk";

// Cost is stored as integer micros on the backend (1 USD = 1_000_000 micros)
// to avoid float drift. Sub-dollar amounts use four decimals so something
// meaningful always shows; otherwise standard USD formatting.
export const formatCostUsd = (micros: number): string => {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
};

export const formatTokens = (n: number): string => {
  if (n < 1_000) return n.toString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

export const isUnlimited = (limit: number): boolean => limit < 0;

export const formatQuotaCeiling = (limit: number): string =>
  isUnlimited(limit) ? "∞" : limit.toLocaleString();

export const formatPlanLabel = (plan: BillingPlan): string => {
  switch (plan) {
    case BillingPlan.Free:
      return "Free";
    case BillingPlan.Personal:
      return "Personal";
    case BillingPlan.Pro:
      return "Pro";
    case BillingPlan.Byok:
      return "BYOK";
  }
};

export const formatPeriodReset = (iso: string, now: Date = new Date()): string => {
  const reset = new Date(iso);
  const diffMs = reset.getTime() - now.getTime();
  if (diffMs <= 0) return "resets soon";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days === 1) return "resets tomorrow";
  if (days <= 14) return `resets in ${days} days`;
  const monthDay = reset.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `resets ${monthDay}`;
};
