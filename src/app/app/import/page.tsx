import Link from "next/link";
import { ImportForm } from "@/components/app/ImportForm";
import { CSV_COLUMNS } from "@/lib/importer";
import { usageForPeriod } from "@/lib/metering";
import { PLANS } from "@/lib/plans";
import { requireTenant } from "@/lib/tenant";

const REQUIRED = new Set(["alert_id", "rule_code", "customer_id", "customer_name", "txn_id", "txn_timestamp", "amount", "direction", "channel"]);

export default async function ImportPage() {
  const t = await requireTenant();
  const usage = await usageForPeriod(t.db, t.ws);
  const plan = PLANS[t.ws.plan];
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Import alerts</h1>
          <p>Upload an alert export from your monitoring system. Each alert is triaged as soon as it lands.</p>
        </div>
        <Link className="btn btn-outline btn-small" href="/app/import/template">
          Download the CSV template
        </Link>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Upload a CSV</h2>
            <span>
              {t.mode === "demo" ? "demo workspace" : `${usage.runs} of ${plan.includedRuns?.toLocaleString() ?? "contract"} runs used this month`}
            </span>
          </div>
          <div className="panel__body">
            <ImportForm />
          </div>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>File layout</h2>
            <span>one row per transaction</span>
          </div>
          <div className="panel__body" style={{ fontSize: 13.5 }}>
            <p style={{ marginBottom: 10 }}>
              Rows that share an <code>alert_id</code> become one alert. Customer fields are read from the first row of each alert. Mark the transactions that fired the rule with <code>triggered</code> = Y. Dates are ISO 8601. Amounts are in dollars.
            </p>
            <table className="table">
              <tbody>
                {CSV_COLUMNS.map((c) => (
                  <tr key={c}>
                    <td className="num" style={{ padding: "5px 8px" }}>
                      {c}
                    </td>
                    <td style={{ padding: "5px 8px", color: REQUIRED.has(c) ? "var(--ink)" : "var(--pencil)" }}>{REQUIRED.has(c) ? "required" : "optional"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="decide__hint" style={{ marginTop: 10 }}>
              Up to 200 alerts and 5 MB per file. For continuous feeds, use the <Link href="/app/developers">API</Link>.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
