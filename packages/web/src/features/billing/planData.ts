import { BillingPlan } from "@baindar/sdk";

export type PlanFeature = {
  label: string;
  value: string;
};

export type BillingPlanDetails = {
  id: BillingPlan;
  name: string;
  price: number;
  cadence: string;
  tagline: string;
  description: string;
  bestFor: string;
  featured?: boolean;
  footnote?: string;
  features: ReadonlyArray<PlanFeature>;
};

export const BILLING_PLANS: ReadonlyArray<BillingPlanDetails> = [
  {
    id: BillingPlan.Free,
    name: "Free",
    price: 0,
    cadence: "",
    tagline: "Try Baindar with a small library.",
    description: "Everyone starts here. No card required.",
    bestFor: "For trying Baindar before you commit.",
    features: [
      { label: "Documents in your binder", value: "5" },
      { label: "Chat conversations / month", value: "30" },
      { label: "AI summaries / month", value: "20" },
      { label: "File types", value: "EPUB, PDF, images" },
      { label: "Search across your library", value: "Yes" },
    ],
  },
  {
    id: BillingPlan.Personal,
    name: "Personal",
    price: 9,
    cadence: "/mo",
    tagline: "Predictable AI for your library.",
    description:
      "For readers who want AI in their books without thinking about the meter every time.",
    bestFor: "A handful of books a month, with chapter summaries, passages, and questions.",
    features: [
      { label: "Documents in your binder", value: "50" },
      { label: "Chat conversations / month", value: "300" },
      { label: "AI summaries / month", value: "200" },
      { label: "File types", value: "All" },
      { label: "Search across your library", value: "Yes" },
    ],
  },
  {
    id: BillingPlan.Pro,
    name: "Pro",
    price: 19,
    cadence: "/mo",
    tagline: "For power readers, students, and researchers.",
    description:
      "For people who live in their library, from course materials to source-heavy research.",
    bestFor: "Anyone hitting the Personal cap or working on cross-document synthesis.",
    featured: true,
    features: [
      { label: "Documents in your binder", value: "500" },
      { label: "Chat conversations / month", value: "1,000" },
      { label: "AI summaries / month", value: "1,000" },
      { label: "File types", value: "All, full corpus search" },
      { label: "Search across your library", value: "Yes" },
    ],
  },
  {
    id: BillingPlan.Byok,
    name: "BYOK",
    price: 5,
    cadence: "/mo",
    tagline: "Unlimited AI with your own provider key.",
    description: "You pay your AI provider directly. Baindar hosts the app and library.",
    bestFor: "Heavy users who already have their own AI provider account.",
    footnote: "Within fair-use storage limits.",
    features: [
      { label: "Documents in your binder", value: "Unlimited" },
      { label: "Chat conversations / month", value: "Unlimited" },
      { label: "AI summaries / month", value: "Unlimited" },
      { label: "File types", value: "All, full corpus search" },
      { label: "Search across your library", value: "Yes" },
    ],
  },
];

export const getPlanDetails = (plan: BillingPlan): BillingPlanDetails =>
  BILLING_PLANS.find((item) => item.id === plan) ?? BILLING_PLANS[0];
