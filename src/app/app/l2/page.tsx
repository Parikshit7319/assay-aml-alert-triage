import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { alerts, customers, triageRuns } from "@/lib/db/schema";
import { daysLeft, fmtDate, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

export default async function L2Page() {
  const t = await requireTenant();
  const rows = await t.db
    .select({ alert: alerts, customer: customers, run: triageRuns })
    .from(alerts)
    .innerJoin(customers, eq(customers.id, alerts.customerId))
    .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
    .where(and(eq(alerts.workspaceId, t.ws.id), inArray(alerts.status, ["escalated", "sar_filed"])))
    .orderBy(asc(alerts.sarDueAt), asc(alerts.decidedAt));

  return (
    <>
      <div className="app-head">
        <div>
          <h1>L2 investigations</h1>
          <p>Escalated alerts. The SAR clock starts when an investigator marks the activity suspicious, and only a person can record a SAR decision.</p>
        </div>
      </div>
      <section className="panel">
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Narrative draft</th>
                  <th>SAR clock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ alert, customer, run }) => {
                  const left = alert.sarDueAt ? daysLeft(alert.sarDueAt) : null;
                  return (
                    <tr key={alert.id}>
                      <td>
                        <Link className="row-link num" href={`/app/alerts/${alert.id}`}>
                          {alert.id}
                        </Link>
                        <span className="cell-sub">{alert.ruleCode}</span>
                      </td>
                      <td>{customer.name}</td>
                      <td>{TYPOLOGY_LABEL[alert.typology]}</td>
                      <td>{run?.narrative ? "Ready" : "None"}</td>
                      <td className="num">
                        {alert.status === "sar_filed" ? (
                          "Filed"
                        ) : left == null ? (
                          <span className="cell-sub">Not started</span>
                        ) : (
                          <span className={left <= 7 ? "sla-late" : undefined}>
                            {left} days, due {fmtDate(alert.sarDueAt!)}
                          </span>
                        )}
                      </td>
                      <td>{STATUS_LABEL[alert.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>No escalations yet</h2>
            <p>
              Escalate an alert from the <Link href="/app">queue</Link> and it lands here with the agent&apos;s draft narrative attached.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
