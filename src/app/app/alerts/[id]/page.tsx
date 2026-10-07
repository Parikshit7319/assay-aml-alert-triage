import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertWorkspace } from "@/components/app/AlertWorkspace";
import { alerts, decisions, triageRuns } from "@/lib/db/schema";
import { loadCollab } from "@/lib/collab";
import { OPEN, queueRows } from "@/lib/queries";
import { computeFindings } from "@/lib/engine/detectors";
import { loadBundle } from "@/lib/engine/run";
import { requireTenant } from "@/lib/tenant";
import { OVERRIDE_REASONS } from "@/lib/workflow";
import { decideAction, markSuspiciousAction, rerunAction, sarDecisionAction } from "../../actions";
import { addNote, assignAlert } from "../../collab-actions";

export default async function AlertPage(props: PageProps<"/app/alerts/[id]">) {
  const { id } = await props.params;
  const t = await requireTenant();
  let bundle;
  try {
    bundle = await loadBundle(t.db, t.ws, id);
  } catch {
    notFound();
  }
  const [alert] = await t.db.select().from(alerts).where(and(eq(alerts.id, id), eq(alerts.workspaceId, t.ws.id)));
  if (!alert) notFound();
  const runs = await t.db.select().from(triageRuns).where(and(eq(triageRuns.alertId, id), eq(triageRuns.workspaceId, t.ws.id))).orderBy(desc(triageRuns.startedAt));
  const decs = await t.db.select().from(decisions).where(and(eq(decisions.alertId, id), eq(decisions.workspaceId, t.ws.id))).orderBy(asc(decisions.createdAt));
  const findings = computeFindings(bundle, t.ws.settings);
  const run = runs.find((r) => r.id === alert.latestRunId) ?? runs[0] ?? null;

  const cited = new Set((run?.rationale ?? []).flatMap((r) => r.citations));
  const historyCited = bundle.history.filter((h) => cited.has(h.id));
  const open = ["new", "triaged", "locked"].includes(alert.status);
  const shadow = open && t.ws.settings.autonomy[alert.typology] === 0;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const [collab, queue] = await Promise.all([loadCollab(t.db, t.ws.id, id), queueRows(t.db, t.ws.id, OPEN)]);
  const order = queue.map((r) => r.id);
  const idx = order.indexOf(id);
  const nextId = idx >= 0 ? order[idx + 1] : order[0];
  const prevId = idx > 0 ? order[idx - 1] : null;

  return (
    <>
      <p style={{ marginBottom: 10, fontSize: 13.5 }}>
        <Link href="/app">Alert queue</Link>
      </p>
      <AlertWorkspace
        actions={{ decide: decideAction, markSuspicious: markSuspiciousAction, sarDecision: sarDecisionAction, rerun: rerunAction, assign: assignAlert, addNote }}
        collab={{ members: collab.members, assigneeId: collab.assigneeId, currentUserId: t.user?.id, notes: collab.notes }}
        ask={run ? { bundle, findings, result: run } : undefined}
        institution={{ name: t.ws.name, contact: t.actor }}
        customerHref={`/app/customers/${bundle.customer.id}`}
        nav={{ nextHref: nextId && nextId !== id ? `/app/alerts/${nextId}` : null, prevHref: prevId ? `/app/alerts/${prevId}` : null, position: idx >= 0 ? `${idx + 1} of ${order.length}` : undefined }}
        headerExtra={
          <span className="ws-links">
            <a href={`/app/alerts/${id}/sar`}>SAR draft (Word)</a>
            <a href={`/app/alerts/${id}/sar?format=html`}>Printable SAR draft</a>
          </span>
        }
        alert={{
          id: alert.id,
          externalId: alert.externalId,
          ruleCode: alert.ruleCode,
          ruleDescription: alert.ruleDescription,
          typology: alert.typology,
          status: alert.status,
          createdAt: alert.createdAt.toISOString(),
          slaDueAt: alert.slaDueAt.toISOString(),
          suspicionDeterminedAt: iso(alert.suspicionDeterminedAt),
          sarDueAt: iso(alert.sarDueAt),
          triggeredTxnIds: alert.triggeredTxnIds,
          source: alert.source,
        }}
        customer={{ ...bundle.customer, onboardedAt: iso(bundle.customer.onboardedAt) }}
        transactions={[...bundle.transactions].reverse().map((x) => ({ ...x, ts: x.ts.toISOString() }))}
        historyCited={historyCited.map((x) => ({ ...x, ts: x.ts.toISOString() }))}
        historyCount={bundle.history.length}
        priorCases={bundle.priorCases.map((c) => ({ ...c, openedAt: c.openedAt.toISOString() }))}
        watchlistHits={findings.watchlistHits}
        injectionTxnIds={findings.injection.map((h) => h.txnId)}
        run={
          run
            ? {
                id: run.id,
                startedAt: run.startedAt.toISOString(),
                finishedAt: run.finishedAt.toISOString(),
                agentIdentity: run.agentIdentity,
                provider: run.provider,
                model: run.model,
                policyVersion: run.policyVersion,
                promptVersion: run.promptVersion,
                outcome: run.outcome,
                modelRecommendation: run.modelRecommendation,
                recommendation: run.recommendation,
                confidence: run.confidence,
                riskScore: run.riskScore,
                rationale: run.rationale,
                trace: run.trace,
                policyHits: run.policyHits,
                validation: run.validation,
                narrative: run.narrative,
                batchEligible: run.batchEligible,
                inputTokens: run.inputTokens,
                outputTokens: run.outputTokens,
                costMicros: run.costMicros,
                costEstimated: run.costEstimated,
              }
            : null
        }
        runHistory={runs.map((r) => ({ id: r.id, at: r.startedAt.toISOString(), model: r.model, policyVersion: r.policyVersion, recommendation: r.recommendation }))}
        decisions={decs.map((d) => ({ id: d.id, actorType: d.actorType, actorName: d.actorName, action: d.action, reasonCode: d.reasonCode, note: d.note, createdAt: d.createdAt.toISOString() }))}
        shadow={shadow}
        reasons={OVERRIDE_REASONS.map((r) => ({ ...r }))}
        demo={t.mode === "demo"}
      />
    </>
  );
}
