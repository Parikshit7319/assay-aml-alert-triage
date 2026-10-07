import { Time } from "@/components/workbench/Time";
import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { alerts, customers } from "@/lib/db/schema";

import { requireTenant } from "@/lib/tenant";

const KIND = { individual: "Individual", business: "Business" } as const;
const RISK = { low: "Low", medium: "Medium", high: "High" } as const;

export default async function CustomersPage() {
  const t = await requireTenant();
  const open = sql`${alerts.status} in ('new','triaged','locked')`;
  const rows = await t.db
    .select({
      id: customers.id,
      name: customers.name,
      kind: customers.kind,
      occupation: customers.occupation,
      country: customers.country,
      riskRating: customers.riskRating,
      total: sql<number>`count(${alerts.id})::int`,
      open: sql<number>`count(${alerts.id}) filter (where ${open})::int`,
      l2: sql<number>`count(${alerts.id}) filter (where ${alerts.status} = 'escalated')::int`,
      sars: sql<number>`count(${alerts.id}) filter (where ${alerts.status} = 'sar_filed')::int`,
      lastAlert: sql<Date | null>`max(${alerts.createdAt})`,
    })
    .from(customers)
    .leftJoin(alerts, eq(alerts.customerId, customers.id))
    .where(eq(customers.workspaceId, t.ws.id))
    .groupBy(customers.id)
    .orderBy(desc(sql`count(${alerts.id}) filter (where ${open})`), desc(sql`count(${alerts.id})`), asc(customers.name))
    .limit(500);
  const withOpen = rows.filter((r) => r.open > 0).length;

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Customers</h1>
          <p>
            Everyone with an alert or a profile in this workspace, with open alerts first. Open a customer for the KYC profile, every alert, prior cases and 90 days of activity in one place.
          </p>
        </div>
      </div>
      <section className="panel table-wrap" aria-labelledby="cust-h">
        <div className="panel__head">
          <h2 id="cust-h">All customers</h2>
          <span>
            {rows.length} {rows.length === 1 ? "customer" : "customers"}, {withOpen} with open alerts
          </span>
        </div>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Type</th>
                <th scope="col">Risk rating</th>
                <th scope="col" className="r">
                  Open alerts
                </th>
                <th scope="col" className="r">
                  In L2
                </th>
                <th scope="col" className="r">
                  SARs filed
                </th>
                <th scope="col" className="r">
                  All alerts
                </th>
                <th scope="col">Latest alert</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="row-link" href={`/app/customers/${encodeURIComponent(r.id)}`}>
                      {r.name}
                    </Link>
                    <span className="cell-sub num">
                      {r.id}
                      {r.occupation ? `, ${r.occupation}` : ""}
                    </span>
                  </td>
                  <td>
                    {KIND[r.kind]}
                    <span className="cell-sub">{r.country}</span>
                  </td>
                  <td>
                    <span className={r.riskRating === "high" ? "sla-late" : undefined}>{RISK[r.riskRating]}</span>
                  </td>
                  <td className="r num">{r.open}</td>
                  <td className="r num">{r.l2}</td>
                  <td className="r num">{r.sars}</td>
                  <td className="r num">{r.total}</td>
                  <td className="num">{r.lastAlert ? <Time value={r.lastAlert} format="date" /> : <span className="cell-sub">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h2>No customers yet</h2>
            <p>
              Customers arrive with their alerts. <Link href="/app/import">Import a CSV</Link> or send alerts through the API.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
