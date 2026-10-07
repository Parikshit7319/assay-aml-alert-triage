/**
 * Agent versus human on decided alerts, for the shadow-mode report. Pure: the
 * server page loads decisions and runs, this module does the counting. The
 * matrix itself is the same `confusionMatrix` the browser demo uses.
 */
import type { AutonomyLevel, DecisionAction, Recommendation, Typology } from "@/lib/db/schema";
import { confusionMatrix, type ConfusionMatrix, type ShadowRow } from "@/lib/demo/shadow";

export type { ConfusionMatrix };

/** One alert with its first human L1 decision and the agent run that decision was made against. */
export interface DecidedAlertLike {
  alertId: string;
  typology: Typology;
  customerName?: string;
  /** Final recommendation after policy, or null when the agent never ran. */
  agentRecommendation: Recommendation | null;
  modelRecommendation: Recommendation | null;
  confidence: number | null;
  humanAction: DecisionAction;
  decidedAt: Date | string;
}

const HUMAN_CLOSE: DecisionAction[] = ["accept_close", "override_to_close", "batch_close"];
const HUMAN_ESCALATE: DecisionAction[] = ["accept_escalate", "override_to_escalate"];

/** The L1 disposition a human decision stands for, or null for agent and L2 actions. */
export function humanDisposition(action: DecisionAction): "close" | "escalate" | null {
  if (HUMAN_CLOSE.includes(action)) return "close";
  if (HUMAN_ESCALATE.includes(action)) return "escalate";
  return null;
}

/** Rows the matrix can count: a human L1 disposition and an agent recommendation. Others are skipped. */
export function toShadowRows(items: readonly DecidedAlertLike[]): ShadowRow[] {
  const rows: ShadowRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.alertId)) continue;
    const human = humanDisposition(it.humanAction);
    if (!human || !it.agentRecommendation) continue;
    seen.add(it.alertId);
    const model = it.modelRecommendation === "close" || it.modelRecommendation === "escalate" ? it.modelRecommendation : null;
    rows.push({
      id: it.alertId,
      typology: it.typology,
      customerName: it.customerName ?? "",
      agent: it.agentRecommendation,
      model,
      human,
      confidence: it.confidence ?? 0,
      createdAt: new Date(it.decidedAt),
    });
  }
  return rows;
}

export interface TypologyShadow {
  typology: Typology;
  level: AutonomyLevel;
  /** True when the typology is at L0: the agent runs but analysts do not see its output. */
  inShadow: boolean;
  matrix: ConfusionMatrix;
}

export interface ShadowReport {
  overall: ConfusionMatrix;
  byTypology: TypologyShadow[];
  /** Typologies currently at L0. */
  shadowTypologies: Typology[];
  /** Decided alerts left out: no agent run, or no human L1 decision (auto-closed). */
  skipped: number;
}

/**
 * Confusion matrix overall and per typology, plus which typologies are in
 * shadow. Typologies with no decided alerts still appear when they are at L0,
 * so the page can say there is nothing to compare yet.
 */
export function shadowReport(items: readonly DecidedAlertLike[], autonomy: Partial<Record<Typology, AutonomyLevel>>): ShadowReport {
  const rows = toShadowRows(items);
  const distinct = new Set(items.map((i) => i.alertId)).size;
  const shadowTypologies = (Object.keys(autonomy) as Typology[]).filter((t) => autonomy[t] === 0);
  const typologies = [...new Set<Typology>([...rows.map((r) => r.typology), ...shadowTypologies])];
  const byTypology = typologies
    .map((typology) => {
      const level = (autonomy[typology] ?? 1) as AutonomyLevel;
      return { typology, level, inShadow: level === 0, matrix: confusionMatrix(rows, typology) };
    })
    .sort((a, b) => b.matrix.total - a.matrix.total || a.typology.localeCompare(b.typology));
  return { overall: confusionMatrix(rows), byTypology, shadowTypologies, skipped: Math.max(0, distinct - rows.length) };
}
