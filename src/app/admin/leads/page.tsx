import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin";
import { getDb } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pilot requests", robots: { index: false } };

/** Operator-only view of pilot requests. Access: signed-in users whose email is in ADMIN_EMAILS. */
export default async function LeadsPage() {
  await requireOperator();
  const db = await getDb();
  const rows = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(500);
  return (
    <main style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <nav aria-label="Operator pages" style={{ display: "flex", gap: 16, marginBottom: 18, fontSize: 13.5 }}>
        <span aria-current="page">Pilot requests</span>
        <Link href="/admin/analytics">Site analytics</Link>
      </nav>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Pilot requests ({rows.length})</h1>
      <div className="prose" style={{ maxWidth: "none" }}>
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Name</th>
              <th>Company</th>
              <th>Segment</th>
              <th>Alerts a month</th>
              <th>System</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.createdAt.toISOString().slice(0, 10)}</td>
                <td>
                  {r.name}
                  <br />
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                  {r.role ? <br /> : null}
                  {r.role}
                </td>
                <td>{r.company}</td>
                <td>{r.segment}</td>
                <td>{r.monthlyAlerts?.toLocaleString()}</td>
                <td>{r.monitoringSystem}</td>
                <td>{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
