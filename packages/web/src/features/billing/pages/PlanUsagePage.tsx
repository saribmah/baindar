import { Link, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { BillingPlan, type BillingStatus } from "@baindar/sdk";
import { Button, Icons } from "@baindar/ui";
import { useLibraryDocuments } from "../../library/hooks/useLibraryDocuments";
import { AppSidebar } from "../../library/components/AppSidebar";
import { useLibraryShelves } from "../../library/hooks/useLibraryShelves";
import { useProfileName } from "../../profile";
import { getPlanDetails } from "../planData";
import { useBillingStatus } from "../hooks/useBillingStatus";
import {
  formatCostUsd,
  formatPeriodReset,
  formatPlanLabel,
  formatQuotaCeiling,
  formatTokens,
  isUnlimited,
} from "../utils/format";
import { UsageBar } from "../components/UsageBar";

export function PlanUsagePage() {
  const reader = useProfileName();
  const { documents, counts, uploading, uploadDocument } = useLibraryDocuments();
  const { shelves } = useLibraryShelves(documents);
  const { billing, loading } = useBillingStatus();
  const [searchParams] = useSearchParams();

  return (
    <main className="flex h-dvh min-h-screen overflow-hidden bg-bd-bg text-bd-fg">
      <AppSidebar
        reader={reader}
        uploading={uploading}
        onUpload={uploadDocument}
        shelves={shelves}
      />

      <section className="min-w-0 flex-1 overflow-y-auto px-6 pb-8 pt-16 lg:px-16 lg:py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-7">
          <div>
            <div className="t-label-s text-bd-fg-muted">SETTINGS · PLAN & USAGE</div>
            <h1 className="m-0 mt-1 font-display text-[40px] font-normal leading-[1.05] tracking-normal text-bd-fg">
              Your plan
            </h1>
          </div>

          {searchParams.get("checkout") === "success" && (
            <div className="rounded-lg border border-bd-border bg-bd-surface-raised px-4 py-3 text-bd-fg">
              <div className="t-label-l">Plan update received</div>
              <div className="t-body-s mt-0.5 text-bd-fg-muted">
                Polar is syncing your subscription. This page refreshes billing status in the
                background.
              </div>
            </div>
          )}

          {billing ? (
            <PlanUsage billing={billing} documentsUsed={counts.all} />
          ) : (
            <div className="rounded-xl border border-bd-border bg-bd-surface p-8">
              <div className="t-body-m text-bd-fg-muted">
                {loading ? "Loading billing..." : "Billing is not available right now."}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PlanUsage({ billing, documentsUsed }: { billing: BillingStatus; documentsUsed: number }) {
  const plan = getPlanDetails(billing.plan);
  const paid = billing.plan !== BillingPlan.Free;

  return (
    <>
      <section className="bd-card flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:p-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-label-s text-bd-fg-muted">CURRENT PLAN</span>
            <span className="bd-chip h-[22px] bg-bd-surface-raised text-[10px]">
              {formatPlanLabel(billing.plan)}
            </span>
            {billing.cancelAtPeriodEnd && (
              <span className="bd-chip h-[22px] border border-warning bg-transparent text-[10px] text-warning">
                Cancels at period end
              </span>
            )}
          </div>
          <h2 className="m-0 mt-2 font-display text-[32px] font-normal leading-[1.08] tracking-normal">
            {paid
              ? `Baindar ${plan.name} · $${plan.price}${plan.cadence}.`
              : "Baindar, the free way."}
          </h2>
          <p className="t-body-m m-0 mt-2 max-w-[560px] text-bd-fg-subtle">{plan.description}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {billing.portalUrl ? (
              <a href={billing.portalUrl} target="_blank" rel="noreferrer">
                <Button variant="primary" size="md" iconEnd={<ExternalArrow />}>
                  Manage plan
                </Button>
              </a>
            ) : (
              <Link to="/plans" className="bd-btn bd-btn-pill bd-btn-wine bd-btn-md">
                See plans
              </Link>
            )}
            <Link to="/plans" className="bd-btn bd-btn-pill bd-btn-secondary bd-btn-md">
              Compare plans
            </Link>
          </div>
        </div>

        <div className="grid gap-4 border-t border-bd-border pt-5 sm:grid-cols-3 lg:min-w-[300px] lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <PlanMeta label="Billing status" value={billing.status.replace(/_/g, " ")} />
          <PlanMeta
            label="Usage window"
            value={`${formatShortDate(billing.currentPeriod.periodStart)} → ${formatShortDate(
              billing.currentPeriod.periodEnd,
            )}`}
          />
          <PlanMeta label="Counters" value={formatPeriodReset(billing.periodResetAt)} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="m-0 font-display text-[22px] font-medium tracking-normal">This month</h2>
          <span className="t-body-s text-bd-fg-muted">Counters reset on the 1st</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <UsageCard>
            <UsageBar
              label="Documents in binder"
              used={documentsUsed}
              limit={billing.quota.documentsLimit}
              hint={documentsHint(documentsUsed, billing.quota.documentsLimit)}
            />
          </UsageCard>
          <UsageCard>
            <UsageBar
              label="Chat conversations"
              used={billing.currentPeriod.chatTurns}
              limit={billing.quota.chatTurnsLimit}
              hint={usageHint(
                billing.currentPeriod.chatTurns,
                billing.quota.chatTurnsLimit,
                "conversation",
              )}
            />
          </UsageCard>
          <UsageCard>
            <UsageBar
              label="AI summaries"
              used={billing.currentPeriod.summaries}
              limit={billing.quota.summariesLimit}
              hint={usageHint(
                billing.currentPeriod.summaries,
                billing.quota.summariesLimit,
                "summary",
              )}
            />
          </UsageCard>
        </div>
      </section>

      <section
        className={
          billing.plan === BillingPlan.Free ? "grid gap-4 lg:grid-cols-[1fr_280px]" : "max-w-sm"
        }
      >
        {billing.plan === BillingPlan.Free && (
          <div className="rounded-xl bg-gradient-to-br from-wine-800 to-wine-700 p-6 text-paper-50">
            <div className="flex items-center gap-4">
              <Icons.Sparkles size={28} color="currentColor" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-[22px] font-medium leading-[1.15] tracking-normal">
                  Lift the cap and keep reading without stopping to think about it.
                </div>
                <div className="t-body-m mt-1 text-paper-200">
                  Personal is $9/mo for 50 documents and 300 chats. Pro is $19 for 500 documents and
                  1,000 chats.
                </div>
              </div>
              <Link
                to="/plans"
                className="bd-btn bd-btn-pill bd-btn-md shrink-0 bg-paper-50 text-wine-800"
              >
                See plans
              </Link>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-bd-border bg-bd-surface p-5">
          <div className="t-label-s text-bd-fg-muted">AI COST THIS PERIOD</div>
          <div className="mt-2 font-display text-[30px] font-normal leading-none tracking-normal">
            {formatCostUsd(billing.currentPeriod.costUsdMicros)}
          </div>
          <div className="t-body-s mt-2 text-bd-fg-muted">
            {formatTokens(billing.currentPeriod.inputTokens)} in ·{" "}
            {formatTokens(billing.currentPeriod.outputTokens)} out
          </div>
        </div>
      </section>
    </>
  );
}

function PlanMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="t-label-s text-bd-fg-muted">{label}</div>
      <div className="t-body-m mt-0.5 capitalize text-bd-fg">{value}</div>
    </div>
  );
}

function UsageCard({ children }: { children: ReactNode }) {
  return <div className="bd-card flex flex-col gap-3 p-5">{children}</div>;
}

function ExternalArrow() {
  return <Icons.Chevron size={12} color="currentColor" className="-rotate-45" />;
}

const documentsHint = (used: number, limit: number): string => {
  if (isUnlimited(limit)) return "Lifetime storage, within fair-use limits.";
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return "Your binder is full on this plan.";
  return `${remaining.toLocaleString()} ${remaining === 1 ? "slot" : "slots"} left.`;
};

const usageHint = (used: number, limit: number, noun: string): string => {
  if (isUnlimited(limit)) return "Unlimited on this plan.";
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return `No ${noun}s left this period.`;
  return `${remaining.toLocaleString()} of ${formatQuotaCeiling(limit)} left.`;
};

const formatShortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
