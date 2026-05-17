import { Link } from "react-router-dom";
import { BillingPlan } from "@baindar/sdk";
import type { BillingPlanDetails } from "../planData";

export type PlanCardAction =
  | { kind: "disabled"; label: string }
  | { kind: "external"; label: string; href: string }
  | { kind: "internal"; label: string; to: string }
  | { kind: "purchase"; label: string; onPurchase: () => void | Promise<void>; pending?: boolean };

export function PlanCard({
  plan,
  action,
  currentPlan,
  compact = false,
}: {
  plan: BillingPlanDetails;
  action: PlanCardAction;
  currentPlan?: BillingPlan | null;
  compact?: boolean;
}) {
  const current = currentPlan === plan.id;
  const featured = plan.featured === true;
  const cardClass = featured
    ? "bg-bd-fg text-bd-bg shadow-[var(--sh-lg)]"
    : "border border-bd-border bg-bd-bg text-bd-fg";
  const mutedClass = featured ? "text-bd-bg/65" : "text-bd-fg-muted";
  const subtleClass = featured ? "text-bd-bg/80" : "text-bd-fg-subtle";

  return (
    <article className={`relative flex min-w-0 flex-1 flex-col gap-3 rounded-xl p-5 ${cardClass}`}>
      {featured && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-bd-accent px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.06em] text-bd-accent-fg">
          Most chosen
        </span>
      )}
      {current && (
        <span className="absolute -top-2.5 right-6 rounded-full border border-bd-border-strong bg-bd-bg px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.06em] text-bd-fg">
          Current plan
        </span>
      )}

      <div>
        <div className={`t-label-s ${mutedClass}`}>{plan.name.toUpperCase()}</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-display text-[42px] font-normal leading-none tracking-normal">
            ${plan.price}
          </span>
          {plan.cadence && <span className={`t-body-m ${mutedClass}`}>{plan.cadence}</span>}
        </div>
        <p className={`m-0 mt-2 font-reading text-[14px] leading-[1.45] ${subtleClass}`}>
          {plan.tagline}
        </p>
      </div>

      <div className={featured ? "h-px bg-bd-bg/15" : "h-px bg-bd-border"} />

      <div className="flex flex-col gap-2.5">
        {plan.features.map((feature) => (
          <div key={feature.label} className="flex items-baseline justify-between gap-3">
            <span className={`t-body-s text-[12px] ${mutedClass}`}>{feature.label}</span>
            <span className="text-right font-ui text-[13px] font-medium">{feature.value}</span>
          </div>
        ))}
      </div>

      {!compact && (
        <p
          className={`m-0 mt-auto pt-1 font-reading text-[12px] italic leading-[1.5] ${mutedClass}`}
        >
          {plan.bestFor}
        </p>
      )}

      {plan.footnote && !compact && (
        <div className={`t-body-s text-[10px] ${mutedClass}`}>{plan.footnote}</div>
      )}

      <PlanActionButton plan={plan} action={action} featured={featured} current={current} />
    </article>
  );
}

function PlanActionButton({
  plan,
  action,
  featured,
  current,
}: {
  plan: BillingPlanDetails;
  action: PlanCardAction;
  featured: boolean;
  current: boolean;
}) {
  const disabledCurrent = current && action.kind === "disabled";
  const className = "bd-btn bd-btn-pill bd-btn-md mt-1 w-full";
  // Inline style sidesteps a UI-package reset (`button { color: inherit }`)
  // that wins over Tailwind utility classes in the unlayered cascade and
  // silently paints button text the parent card's color — invisible when
  // it matches the button's own bg.
  const style = disabledCurrent
    ? featured
      ? {
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "color-mix(in srgb, var(--bd-bg) 65%, transparent)",
        }
      : {
          border: "1px solid var(--bd-border)",
          background: "transparent",
          color: "var(--bd-fg-muted)",
        }
    : featured
      ? { background: "var(--bd-bg)", color: "var(--bd-fg)" }
      : plan.id === BillingPlan.Free
        ? {
            border: "1px solid var(--bd-border-strong)",
            background: "transparent",
            color: "var(--bd-fg-subtle)",
          }
        : { background: "var(--bd-fg)", color: "var(--bd-bg)" };

  if (action.kind === "external") {
    return (
      <a href={action.href} target="_blank" rel="noreferrer" className={className} style={style}>
        {action.label}
      </a>
    );
  }

  if (action.kind === "internal") {
    return (
      <Link to={action.to} className={className} style={style}>
        {action.label}
      </Link>
    );
  }

  if (action.kind === "purchase") {
    return (
      <button
        type="button"
        className={className}
        style={style}
        disabled={action.pending === true}
        onClick={() => {
          void action.onPurchase();
        }}
      >
        {action.pending === true ? "Opening checkout…" : action.label}
      </button>
    );
  }

  return (
    <button type="button" disabled className={className} style={style}>
      {action.label}
    </button>
  );
}
