import { BillingPlan } from "@baindar/sdk";

// Cost is stored as integer micros (1 USD = 1_000_000 micros) on the backend
// to avoid float drift. Render as USD with two decimals for sub-dollar amounts
// and four for very small (< $0.01) so a meaningful number always shows.
export const formatCostUsd = (micros: number): string => {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
};

// Compact token counts: "1.2K", "350K", "1.5M". Tokens grow large fast and a
// raw "1,234,567 tokens" reads as noise.
export const formatTokens = (n: number): string => {
  if (n < 1_000) return n.toString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
};

// A quota of -1 means "unlimited" (BYOK plan). UI should render the infinity
// glyph rather than a useless "-1".
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
