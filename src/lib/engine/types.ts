import type {
  PolicyHit,
  PolicySettings,
  RationaleItem,
  Recommendation,
  TraceStep,
  Typology,
  ValidationResult,
} from "@/lib/db/schema";

export interface CustomerRecord {
  id: string;
  name: string;
  kind: "individual" | "business";
  occupation: string | null;
  country: string;
  onboardedAt: Date | null;
  riskRating: "low" | "medium" | "high";
  expectedMonthlyVolumeCents: number | null;
  kycNotes: string | null;
}

export interface TxnRecord {
  id: string;
  ts: Date;
  amountCents: number;
  direction: "in" | "out";
  channel: "cash" | "wire" | "ach" | "p2p" | "card" | "check";
  counterpartyName: string | null;
  counterpartyCountry: string | null;
  branch: string | null;
  memo: string | null;
}

export interface CaseRecord {
  id: string;
  kind: "alert" | "sar";
  openedAt: Date;
  outcome: string;
  summary: string;
}

export interface WatchlistRecord {
  id: string;
  name: string;
  listName: string;
  country: string | null;
}

export interface AlertRecord {
  id: string;
  ruleCode: string;
  ruleDescription: string;
  typology: Typology;
  createdAt: Date;
  triggeredTxnIds: string[];
}

/** Everything the agent is allowed to see for one alert. */
export interface EvidenceBundle {
  alert: AlertRecord;
  customer: CustomerRecord;
  transactions: TxnRecord[]; // lookback window, oldest first
  history: TxnRecord[]; // longer history used for seasonality
  priorCases: CaseRecord[];
  watchlist: WatchlistRecord[];
  highRiskCountries: string[];
  /** Measured wall-clock time, in milliseconds, spent loading each part of the evidence. */
  loadTimings?: Partial<Record<"alert" | "customer" | "transactions" | "priorCases" | "watchlist", number>>;
}

export interface WatchlistHit {
  watchlistId: string;
  watchlistName: string;
  matchedName: string;
  matchedOn: "customer" | "counterparty";
  txnId?: string;
  similarity: number;
  countryMatch: boolean | null;
}

export interface InjectionHit {
  txnId: string;
  field: "memo" | "counterparty";
  excerpt: string;
  pattern: string;
}

/** Deterministic facts computed in code before any model sees the case. */
export interface Findings {
  windowDays: number;
  inflowCents: number;
  outflowCents: number;
  expectedMonthlyCents: number | null;
  volumeVsExpected: number | null; // ratio of 30-day inflow to expected
  structuring?: {
    txnIds: string[];
    count: number;
    totalCents: number;
    minCents: number;
    maxCents: number;
    branches: string[];
    spanDays: number;
    sameDayMultiBranchDays: number;
    sameDayTxnIds: string[];
    thresholdInquiry: boolean; // bank staff note about reporting thresholds
  };
  funnel?: {
    inboundTxnIds: string[];
    inboundCount: number;
    distinctSenders: number;
    inboundCents: number;
    outboundTxnIds: string[];
    outboundCents: number;
    passThroughRatio: number;
    maxHoursToOutbound: number;
    outboundCountries: string[];
    highRiskDestination: boolean;
  };
  wires?: {
    txnIds: string[];
    totalCents: number;
    countries: string[];
    highRiskTxnIds: string[];
    priorSameCountryTxnIds: string[]; // history showing an established relationship
    documentedRelationship: boolean;
  };
  payroll?: {
    txnIds: string[];
    payDates: number;
    cadenceDays: number | null;
    payees: number;
    amountCv: number; // coefficient of variation of per-payee amounts
    totalCents: number;
    consistentWithProfile: boolean;
  };
  seasonal?: {
    currentTxnIds: string[];
    currentCents: number;
    trailingAvgCents: number;
    priorYearTxnIds: string[][]; // one list per prior year
    priorYearCents: number[];
    spikeRatio: number;
    priorYearsMatch: boolean;
  };
  watchlistHits: WatchlistHit[];
  injection: InjectionHit[];
  dataCompleteness: number; // 0..1
  priorSarCount: number;
}

export interface ModelInput {
  bundle: EvidenceBundle;
  findings: Findings;
  settings: PolicySettings;
}

export interface ModelOutput {
  recommendation: "close" | "escalate";
  confidence: number;
  riskScore: number;
  rationale: RationaleItem[];
  narrative: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costEstimated: boolean;
}

export interface ModelProvider {
  id: PolicySettings["provider"];
  model: string;
  assess(input: ModelInput): Promise<ModelOutput>;
}

export interface TriageResult {
  outcome: "completed" | "abstained" | "locked" | "error";
  modelRecommendation: Recommendation | null;
  recommendation: Recommendation;
  confidence: number;
  riskScore: number;
  rationale: RationaleItem[];
  trace: TraceStep[];
  policyHits: PolicyHit[];
  validation: ValidationResult;
  narrative: string | null;
  batchEligible: boolean;
  autoCloseEligible: boolean;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  costEstimated: boolean;
  error?: string;
}
