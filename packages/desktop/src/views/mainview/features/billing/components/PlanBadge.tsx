import { Link } from "react-router-dom";
import { formatPlanLabel } from "../utils/format";
import { useBillingStatus } from "../hooks/useBillingStatus";

export function PlanBadge() {
  const { billing } = useBillingStatus();
  if (!billing) return null;

  return (
    <Link
      to="/settings/plan"
      className="bd-chip bd-chip-outline h-7 shrink-0 no-underline transition-colors hover:border-bd-border-strong hover:text-bd-fg"
    >
      {formatPlanLabel(billing.plan)}
    </Link>
  );
}
