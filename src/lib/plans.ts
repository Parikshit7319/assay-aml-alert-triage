import type { PlanId } from "./db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number | null; // null = custom
  includedRuns: number | null; // null = contract volume
  overagePerRunUsd: number | null;
  seats: number | null;
  liveModel: boolean;
  apiAccess: boolean;
  summary: string;
  features: string[];
}

/**
 * Pricing is a hypothesis to test with design partners, not a validated price.
 * Anchor: modeled L1 review labor of ~$28.85 per alert (30 min at $57.69 per
 * productive hour). The Team rate is ~5% of that before any time saved.
 */
export const PLANS: Record<PlanId, Plan> = {
  sandbox: {
    id: "sandbox",
    name: "Sandbox",
    priceMonthlyUsd: 0,
    includedRuns: 100,
    overagePerRunUsd: null,
    seats: 2,
    liveModel: false,
    apiAccess: false,
    summary: "Try the workflow on test data with the rules model.",
    features: ["100 triage runs a month", "Rules model only", "CSV import", "Audit trail and QA", "2 seats"],
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthlyUsd: 1500,
    includedRuns: 2000,
    overagePerRunUsd: 0.6,
    seats: 10,
    liveModel: true,
    apiAccess: true,
    summary: "For compliance teams of 2 to 25 analysts.",
    features: [
      "2,000 triage runs a month, then $0.60 each",
      "Live model: Anthropic, OpenAI, or Azure OpenAI",
      "REST API and CSV import",
      "QA sampling and autonomy controls",
      "10 seats",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthlyUsd: null,
    includedRuns: null,
    overagePerRunUsd: null,
    seats: null,
    liveModel: true,
    apiAccess: true,
    summary: "For banks and larger programs with their own cloud and model governance.",
    features: [
      "Single-tenant deployment in your Azure subscription",
      "Your model endpoint, your data residency",
      "SSO with Microsoft Entra ID",
      "Model risk documentation pack",
      "Custom typologies and SOPs",
    ],
  },
};

export const LOOKBACK_OFFER = {
  name: "Lookback reviews",
  summary:
    "One-off review of historical alerts or transactions, such as a lookback required by a consent order. Priced per batch after a scoping call.",
};

export const DEMO_RUN_LIMIT = 400;
