import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BillingPlan } from "@baindar/sdk";
import { Button, Icons, Wordmark } from "@baindar/ui";
import { authClient } from "../../auth";
import { useBilling } from "../BillingProvider";
import { BILLING_PLANS } from "../planData";
import { PlanCard, type PlanCardAction } from "../components/PlanCard";

export function PlansPage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const { billing, purchasePlan, manageSubscriptionUrl, rcReady, rcUnavailable } = useBilling();
  const signedIn = !!session.data?.user;
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const currentPlan = billing?.plan ?? null;
  const email = session.data?.user.email ?? "";

  const handlePurchase = async (plan: BillingPlan) => {
    setPurchaseError(null);
    setPendingPlan(plan);
    try {
      const outcome = await purchasePlan(plan);
      if (outcome.status === "success") {
        navigate("/settings/plan?checkout=success");
      } else if (outcome.status === "unavailable") {
        setPurchaseError(
          outcome.reason === "not_configured"
            ? "Billing isn't configured yet. Please contact support."
            : "This plan isn't available right now.",
        );
      } else if (outcome.status === "error") {
        setPurchaseError(outcome.message);
      }
    } finally {
      setPendingPlan(null);
    }
  };

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

        {purchaseError && (
          <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-warning">
            <span className="t-body-m">{purchaseError}</span>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BILLING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={currentPlan}
              action={
                signedIn && !billing
                  ? { kind: "disabled", label: "Loading…" }
                  : planAction({
                      plan: plan.id,
                      signedIn,
                      currentPlan,
                      manageSubscriptionUrl,
                      rcReady,
                      rcUnavailable,
                      onPurchase: handlePurchase,
                      pendingPlan,
                    })
              }
            />
          ))}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-bd-fg-muted">
          <FooterCheck>Cancel any time from your subscription management page.</FooterCheck>
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

function planAction({
  plan,
  signedIn,
  currentPlan,
  manageSubscriptionUrl,
  rcReady,
  rcUnavailable,
  onPurchase,
  pendingPlan,
}: {
  plan: BillingPlan;
  signedIn: boolean;
  currentPlan: BillingPlan | null;
  manageSubscriptionUrl: string | null;
  rcReady: boolean;
  rcUnavailable: boolean;
  onPurchase: (plan: BillingPlan) => void | Promise<void>;
  pendingPlan: BillingPlan | null;
}): PlanCardAction {
  if (currentPlan === plan) {
    if (plan === BillingPlan.Free) {
      return { kind: "disabled", label: "Current plan" };
    }
    return manageSubscriptionUrl
      ? { kind: "external", label: "Manage Plan", href: manageSubscriptionUrl }
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
  if (rcUnavailable) {
    return { kind: "disabled", label: "Unavailable" };
  }
  if (!rcReady) {
    return { kind: "disabled", label: "Loading…" };
  }
  return {
    kind: "purchase",
    label: buttonLabelForPlan(plan),
    onPurchase: () => onPurchase(plan),
    pending: pendingPlan === plan,
  };
}

const labelForPlan = (plan: BillingPlan): string => {
  if (plan === BillingPlan.Byok) return "BYOK";
  return plan[0].toUpperCase() + plan.slice(1);
};

const buttonLabelForPlan = (plan: BillingPlan): string => {
  if (plan === BillingPlan.Byok) return "Bring your key";
  return `Upgrade to ${labelForPlan(plan)}`;
};
