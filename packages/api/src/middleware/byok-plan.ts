import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../app/context";
import { Billing } from "../billing/billing";
import { Instance } from "../instance";

// Gates routes that only BYOK-plan subscribers can hit. Free / Personal /
// Pro users get 403 with a structured payload the frontend can use to
// prompt them to upgrade. Mirrors the 402-return pattern of `quota.ts`
// (no thrown errors — keeps middleware chains free of error-mapper
// requirements).
export const requireByokPlan: MiddlewareHandler<AppEnv> = async (c, next) => {
  const status = await Billing.getStatus(Instance.userId);
  if (status.plan !== "byok") {
    return c.json(
      {
        name: "ByokPlanRequiredError",
        data: {
          plan: status.plan,
          message: "AI provider settings are available on the BYOK plan.",
        },
      },
      403,
    );
  }
  await next();
};
