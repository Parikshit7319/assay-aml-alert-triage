import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Auth tables (Better Auth core schema, camelCase keys, snake columns) */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export type PlanId = "sandbox" | "team" | "enterprise";
export type AutonomyLevel = 0 | 1 | 2 | 3;
export type Typology =
  | "structuring"
  | "funnel_account"
  | "high_risk_wire"
  | "sanctions_name"
  | "payroll_pattern"
  | "seasonal_cash"
  | "other";

export interface PolicySettings {
  version: number;
  autonomy: Record<Typology, AutonomyLevel>;
  closeConfidenceFloor: number; // below this, a "close" becomes human review
  autoCloseConfidenceFloor: number; // L3 only
  watchlistForceL2Similarity: number; // name similarity that forces L2
  minTransactionsForDecision: number; // fewer than this, agent abstains
  qaSampleRate: number; // share of agent-assisted closes sampled for QA
  rationaleDepth: "standard" | "full"; // how much no-SAR rationale to keep
  internalSlaDays: number; // bank policy for alert age, not the SAR clock
  provider: "simulated" | "anthropic" | "openai" | "azure-openai";
  /** Outbound webhook. Not policy: changing it does not bump the policy version. Optional, so older settings stay valid. */
  webhook?: WebhookSettings;
}

export type WebhookFormat = "json" | "slack" | "teams";

export interface WebhookSettings {
  url: string;
  format: WebhookFormat;
  /** HMAC-SHA256 signing secret. Never sent to the browser after it is first shown. */
  secret: string;
  /** Subscribed event names, e.g. "alert.escalated". */
  events: string[];
}

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<"demo" | "customer">().notNull(),
  plan: text("plan").$type<PlanId>().notNull().default("sandbox"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  settings: jsonb("settings").$type<PolicySettings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "admin" | "analyst" | "reviewer">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/* ------------------------------------------------------------------ */
/* Evidence records                                                    */
/* ------------------------------------------------------------------ */

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(), // also the citation id, e.g. KYC-4F2A
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    name: text("name").notNull(),
    kind: text("kind").$type<"individual" | "business">().notNull(),
    occupation: text("occupation"), // or industry for businesses
    country: text("country").notNull().default("US"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    riskRating: text("risk_rating").$type<"low" | "medium" | "high">().notNull().default("medium"),
    expectedMonthlyVolumeCents: integer("expected_monthly_volume_cents"),
    kycNotes: text("kyc_notes"),
  },
  (t) => [index("customers_ws_idx").on(t.workspaceId)],
);

export const transactions = pgTable(
  "transactions",
  {
    // Citation id, e.g. TXN-90AB12KQ. Unique within a workspace: demo workspaces seed thousands
    // of transactions each, so a global key on a short id would eventually collide.
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    direction: text("direction").$type<"in" | "out">().notNull(),
    channel: text("channel").$type<"cash" | "wire" | "ach" | "p2p" | "card" | "check">().notNull(),
    counterpartyName: text("counterparty_name"),
    counterpartyCountry: text("counterparty_country"),
    branch: text("branch"),
    memo: text("memo"), // customer-supplied, always untrusted
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), index("txn_ws_customer_idx").on(t.workspaceId, t.customerId, t.ts)],
);

export const watchlistEntries = pgTable(
  "watchlist_entries",
  {
    id: text("id").primaryKey(), // WL-xxxx
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    listName: text("list_name").notNull(),
    country: text("country"),
  },
  (t) => [index("wl_ws_idx").on(t.workspaceId)],
);

export const priorCases = pgTable(
  "prior_cases",
  {
    id: text("id").primaryKey(), // CASE-xxxx
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"alert" | "sar">().notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    outcome: text("outcome").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => [index("cases_ws_customer_idx").on(t.workspaceId, t.customerId)],
);

/* ------------------------------------------------------------------ */
/* Alerts and agent work                                               */
/* ------------------------------------------------------------------ */

export type AlertStatus =
  | "new" // not yet triaged
  | "triaged" // agent recommendation ready, awaiting L1
  | "locked" // policy locked to human (e.g. suspected tampering)
  | "closed" // L1 closed, no escalation
  | "escalated" // L1 escalated, awaiting L2
  | "sar_filed"
  | "no_sar";

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(), // ALT-xxxx
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    ruleCode: text("rule_code").notNull(),
    ruleDescription: text("rule_description").notNull(),
    typology: text("typology").$type<Typology>().notNull(),
    source: text("source").$type<"seed" | "csv" | "api">().notNull(),
    status: text("status").$type<AlertStatus>().notNull().default("new"),
    triggeredTxnIds: jsonb("triggered_txn_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
    // SAR clock: starts at L2 suspicion determination, never at alert creation (FFIEC).
    suspicionDeterminedAt: timestamp("suspicion_determined_at", { withTimezone: true }),
    sarDueAt: timestamp("sar_due_at", { withTimezone: true }),
    l1Seconds: integer("l1_seconds").notNull().default(0),
    l2Seconds: integer("l2_seconds").notNull().default(0),
    latestRunId: text("latest_run_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    historical: boolean("historical").notNull().default(false), // seeded history for metrics
    agentAssisted: boolean("agent_assisted").notNull().default(true),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("alerts_ws_status_idx").on(t.workspaceId, t.status),
    index("alerts_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("alerts_ws_assignee_idx").on(t.workspaceId, t.assigneeId),
  ],
);

/** Analyst notes and L1-to-L2 handoffs on an alert. Mentions hold user ids. */
export const alertNotes = pgTable(
  "alert_notes",
  {
    id: text("id").primaryKey(), // NOTE-xxxx
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(), // max 4,000 characters, enforced in code
    mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
    kind: text("kind").$type<"note" | "handoff">().notNull().default("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_ws_alert_idx").on(t.workspaceId, t.alertId, t.createdAt)],
);

export interface RationaleItem {
  claim: string;
  citations: string[];
}

export interface TraceStep {
  tool: string;
  label: string;
  summary: string;
  recordIds: string[];
  ms: number;
}

export interface PolicyHit {
  rule: string;
  effect: "lock" | "force_l2" | "abstain" | "downgrade" | "block_autoclose";
  detail: string;
  recordIds: string[];
}

export interface ValidationResult {
  valid: boolean;
  checkedClaims: number;
  unknownCitations: string[];
  uncitedClaims: number;
  amountMismatches: { claim: string; amount: string }[];
}

export type Recommendation = "close" | "escalate" | "human_review";

export const triageRuns = pgTable(
  "triage_runs",
  {
    id: text("id").primaryKey(), // RUN-xxxx
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    agentIdentity: text("agent_identity").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    policyVersion: integer("policy_version").notNull(),
    outcome: text("outcome").$type<"completed" | "abstained" | "locked" | "error">().notNull(),
    modelRecommendation: text("model_recommendation").$type<Recommendation | null>(),
    recommendation: text("recommendation").$type<Recommendation>().notNull(),
    confidence: real("confidence").notNull(),
    riskScore: integer("risk_score").notNull(),
    rationale: jsonb("rationale").$type<RationaleItem[]>().notNull(),
    trace: jsonb("trace").$type<TraceStep[]>().notNull(),
    policyHits: jsonb("policy_hits").$type<PolicyHit[]>().notNull(),
    validation: jsonb("validation").$type<ValidationResult>().notNull(),
    narrative: text("narrative"),
    promptVersion: text("prompt_version"), // hash of the system prompt template, null for runs before it was recorded
    autoCloseEligible: boolean("auto_close_eligible").notNull().default(false),
    batchEligible: boolean("batch_eligible").notNull().default(false),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0), // USD millionths
    costEstimated: boolean("cost_estimated").notNull().default(false),
    error: text("error"),
  },
  (t) => [index("runs_ws_alert_idx").on(t.workspaceId, t.alertId)],
);

export type DecisionAction =
  | "accept_close"
  | "override_to_close"
  | "accept_escalate"
  | "override_to_escalate"
  | "batch_close"
  | "auto_close"
  | "sar_file"
  | "sar_no_file";

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    runId: text("run_id"),
    actorType: text("actor_type").$type<"human" | "agent">().notNull(),
    actorName: text("actor_name").notNull(),
    action: text("action").$type<DecisionAction>().notNull(),
    reasonCode: text("reason_code"),
    note: text("note"),
    agreedWithAgent: boolean("agreed_with_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("decisions_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const qaReviews = pgTable(
  "qa_reviews",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    typology: text("typology").$type<Typology>().notNull(),
    sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull(),
    reviewer: text("reviewer"),
    result: text("result").$type<"agree" | "disagree" | null>(),
    note: text("note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("qa_ws_idx").on(t.workspaceId)],
);

/* Append-only, hash-chained. Each row's hash covers the previous hash. */
export const auditEvents = pgTable(
  "audit_events",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    actorType: text("actor_type").$type<"human" | "agent" | "system">().notNull(),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [index("audit_ws_seq_idx").on(t.workspaceId, t.seq)],
);

/*
 * Weekly rollups per typology. Production fills these from alerts and decisions
 * with a nightly job (see lib/metrics.ts); demo workspaces get synthetic history.
 */
export const metricRollups = pgTable(
  "metric_rollups",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(), // YYYY-MM-DD, Monday
    typology: text("typology").$type<Typology>().notNull(),
    mode: text("mode").$type<"manual" | "shadow" | "assisted">().notNull(),
    alerts: integer("alerts").notNull(),
    closes: integer("closes").notNull(),
    escalations: integer("escalations").notNull(),
    sarsFiled: integer("sars_filed").notNull(),
    l1Seconds: integer("l1_seconds").notNull(),
    l2Seconds: integer("l2_seconds").notNull(),
    recsAccepted: integer("recs_accepted").notNull().default(0),
    recsOverridden: integer("recs_overridden").notNull().default(0),
    qaSampled: integer("qa_sampled").notNull().default(0),
    qaAgreed: integer("qa_agreed").notNull().default(0),
    missedEscalations: integer("missed_escalations").notNull().default(0),
    synthetic: boolean("synthetic").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.weekStart, t.typology] })],
);

/* ------------------------------------------------------------------ */
/* Revenue plumbing                                                    */
/* ------------------------------------------------------------------ */

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    period: text("period").notNull(), // YYYY-MM
    kind: text("kind").$type<"triage_run">().notNull(),
    quantity: integer("quantity").notNull().default(1),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    reportedToStripe: boolean("reported_to_stripe").notNull().default(false),
  },
  (t) => [index("usage_ws_period_idx").on(t.workspaceId, t.period)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.hash)],
);

export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company").notNull(),
  role: text("role"),
  segment: text("segment"),
  monthlyAlerts: integer("monthly_alerts"),
  monitoringSystem: text("monitoring_system"),
  message: text("message"),
});

/*
 * First-party analytics. No IP address or user agent is stored: `visitor` is a
 * 16-hex-character hash of a daily salt, the IP and the user agent, so it
 * cannot be reversed and does not link one day to the next.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    event: text("event").notNull(),
    path: text("path").notNull(),
    label: text("label"),
    referrerHost: text("referrer_host"),
    device: text("device").$type<"mobile" | "tablet" | "desktop">(),
    visitor: text("visitor").notNull(),
  },
  (t) => [index("analytics_ts_idx").on(t.ts), index("analytics_event_ts_idx").on(t.event, t.ts)],
);

export const schema = {
  user,
  session,
  account,
  verification,
  workspaces,
  workspaceMembers,
  customers,
  transactions,
  watchlistEntries,
  priorCases,
  alerts,
  triageRuns,
  decisions,
  qaReviews,
  auditEvents,
  metricRollups,
  usageEvents,
  apiKeys,
  leads,
  alertNotes,
  analyticsEvents,
};
