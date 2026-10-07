import { Time } from "@/components/workbench/Time";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { QaForm } from "@/components/app/QaForm";
import { alerts, customers, qaReviews, triageRuns } from "@/lib/db/schema";
import { REC_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

export default async function QaPage() {
  const t = await requireTenant();
  const base = t.db
    .select({ qa: qaReviews, alert: alerts, customer: customers, run: triageRuns })
    .from(qaReviews)
    .innerJoin(alerts, eq(alerts.id, qaReviews.alertId))
    .innerJoin(customers, eq(customers.id, alerts.customerId))
    .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId));
  const pending = await base.where(and(eq(qaReviews.workspaceId, t.ws.id), isNull(qaReviews.result))).orderBy(desc(qaReviews.sampledAt));
  const done = await t.db
    .select({ qa: qaReviews, alertId: alerts.id, typology: alerts.typology })
    .from(qaReviews)
    .innerJoin(alerts, eq(alerts.id, qaReviews.alertId))
    .where(and(eq(qaReviews.workspaceId, t.ws.id), isNotNull(qaReviews.result)))
    .orderBy(desc(qaReviews.reviewedAt))
    .limit(50);

  return (
    <>
      <div className="app-head">
        <div>
          <h1>QA review</h1>
          <p>
            A sample of agent-assisted closes, drawn at {Math.round(t.ws.settings.qaSampleRate * 100)}% from every batch. A second reviewer checks each one. Agreement here is what earns an alert type more autonomy.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel__head">
          <h2>Waiting for review</h2>
          <span>{pending.length}</span>
        </div>
        {pending.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Type</th>
                  <th>Agent</th>
                  <th>Sampled</th>
                  <th>Your review</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(({ qa, alert, customer, run }) => (
                  <tr key={qa.id}>
                    <td>
                      <Link className="row-link num" href={`/app/alerts/${alert.id}`}>
                        {alert.id}
                      </Link>
                      <span className="cell-sub">{customer.name}</span>
                    </td>
                    <td>{TYPOLOGY_LABEL[alert.typology]}</td>
                    <td>{run ? <span className={`rec rec-${run.recommendation}`}>{REC_LABEL[run.recommendation]} {Math.round(run.confidence * 100)}%</span> : "n/a"}</td>
                    <td className="num"><Time value={qa.sampledAt} /></td>
                    <td style={{ minWidth: 300 }}>
                      <QaForm qaId={qa.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>Nothing to review</h2>
            <p>QA items appear when alerts are closed with the agent&apos;s help. Approve a batch from the queue to draw a sample.</p>
          </div>
        )}
      </section>
      {done.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel__head">
            <h2>Reviewed</h2>
            <span>
              {done.filter((d) => d.qa.result === "agree").length} agree of {done.length}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>Reviewer</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {done.map((d) => (
                  <tr key={d.qa.id}>
                    <td>
                      <Link className="row-link num" href={`/app/alerts/${d.alertId}`}>
                        {d.alertId}
                      </Link>
                    </td>
                    <td>{TYPOLOGY_LABEL[d.typology]}</td>
                    <td className={d.qa.result === "agree" ? "ok" : "warn"}>{d.qa.result === "agree" ? "Agree" : "Disagree"}</td>
                    <td>{d.qa.reviewer}</td>
                    <td>{d.qa.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
