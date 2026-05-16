import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { BillingStatus } from "@baindar/sdk";
import { BillingPlan } from "@baindar/sdk";
import { Button, Icons, Wordmark } from "@baindar/ui";
import { authClient } from "../../auth";
import { useSdk } from "../../../sdk";
import { BILLING_PLANS } from "../planData";
import { PlanCard, type PlanCardAction } from "../components/PlanCard";

export function PlansPage() {
  const navigate = useNavigate();
  const { client } = useSdk();
  const session = authClient.useSession();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const signedIn = !!session.data?.user;

  useEffect(() => {
    if (!signedIn) {
      setBilling(null);
      return;
    }
    let cancelled = false;
    client.billing
      .me()
      .then((res) => {
        if (!cancelled && res.data) setBilling(res.data);
      })
      .catch(() => {
        if (!cancelled) setBilling(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, signedIn]);

  const actions = useMemo(
    () => new Map(billing?.upgradeOptions.map((option) => [option.plan, option.checkoutUrl])),
    [billing],
  );

  const currentPlan = billing?.plan ?? null;
  const email = session.data?.user.email ?? "";

  return (
    <main className="flex min-h-screen flex-col bg-bd-bg text-bd-fg">
      <header className="flex items-center gap-3 border-b border-bd-border px-5 py-4 sm:px-8">
        <button
          type="button"
          aria-label="Go back"
          onClick={() => navigate(signedIn ? "/dashboard" : "/")}
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-bd-surface-raised text-bd-fg hover:bg-bd-surface-hover"
        >
          <Icons.Back size={16} color="currentColor" />
        </button>
        <Link to={signedIn ? "/dashboard" : "/"} className="text-bd-fg">
          <Wordmark size="sm" />
        </Link>
        <div className="h-6 w-px bg-bd-border" />
        <span className="t-label-l">Plans & pricing</span>
        <div className="flex-1" />
        {signedIn ? (
          <>
            {email && <span className="t-body-s hidden text-bd-fg-muted sm:inline">{email}</span>}
            <Link to="/settings/plan" className="bd-btn bd-btn-pill bd-btn-secondary bd-btn-sm">
              Your plan
            </Link>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/signin")}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => navigate("/signup")}>
              Get started
            </Button>
          </div>
        )}
      </header>

      <section className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-7 px-5 py-8 sm:px-8 lg:px-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="t-label-s text-bd-fg-muted">PLANS</div>
            <h1 className="m-0 mt-2 max-w-[760px] font-display text-[42px] font-normal leading-[1.02] tracking-normal text-bd-fg sm:text-[54px]">
              A library you can read into the night, with AI that knows what's on the page.
            </h1>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BILLING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={currentPlan}
              action={
                signedIn && !billing
                  ? { kind: "disabled", label: "Loading..." }
                  : planAction(plan.id, signedIn, currentPlan, actions, billing?.portalUrl)
              }
            />
          ))}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-bd-fg-muted">
          <FooterCheck>Cancel any time from the Polar dashboard.</FooterCheck>
          <FooterCheck>Pro-rated when you change plans.</FooterCheck>
          <FooterCheck>Your documents stay yours when you downgrade.</FooterCheck>
        </div>
      </section>
    </main>
  );
}

function FooterCheck({ children }: { children: string }) {
  return (
    <span className="t-body-s inline-flex items-center gap-1.5">
      <Icons.Check size={14} color="currentColor" />
      {children}
    </span>
  );
}

function planAction(
  plan: BillingPlan,
  signedIn: boolean,
  currentPlan: BillingPlan | null,
  checkoutUrls: Map<BillingPlan, string>,
  portalUrl?: string | null,
): PlanCardAction {
  if (currentPlan === plan) {
    return portalUrl
      ? { kind: "external", label: "Manage Plan", href: portalUrl }
      : { kind: "disabled", label: "Manage Plan" };
  }
  if (!signedIn) {
    return {
      kind: "internal",
      label: plan === BillingPlan.Free ? "Start free" : `Choose ${labelForPlan(plan)}`,
      to: "/signup",
    };
  }
  if (plan === BillingPlan.Free) {
    return { kind: "disabled", label: "Included" };
  }
  const checkoutUrl = checkoutUrls.get(plan);
  if (checkoutUrl) {
    return { kind: "external", label: buttonLabelForPlan(plan), href: checkoutUrl };
  }
  return { kind: "disabled", label: "Unavailable" };
}

const labelForPlan = (plan: BillingPlan): string => {
  if (plan === BillingPlan.Byok) return "BYOK";
  return plan[0].toUpperCase() + plan.slice(1);
};

const buttonLabelForPlan = (plan: BillingPlan): string => {
  if (plan === BillingPlan.Byok) return "Bring your key";
  return `Upgrade to ${labelForPlan(plan)}`;
};
