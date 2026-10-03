import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { verifyChain } from "@/lib/audit";
import { auditEvents } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/labels";
import { requireTenant } from "@/lib/tenant";

function summarize(payload: Record<string, unknown>): string {
  const keys = ["recommendation", "outcome", "confidence", "model", "policyVersion", "reasonCode", "note", "sarDueAt", "from", "to", "alerts", "plan", "status"];
  return keys
    .filter((k) => payload[k] != null && payload[k] !== "")
    .map((k) => `${k}: ${typeof payload[k] === "object" ? JSON.stringify(payload[k]) : String(payload[k])}`)
    .join(", ")
    .slice(0, 160);
}

export default async function AuditPage() {
  const t = await requireTenant();
  const [chain, events] = await Promise.all([
    verifyChain(t.db, t.ws.id),
    t.db.select().from(auditEvents).where(eq(auditEvents.workspaceId, t.ws.id)).orderBy(desc(auditEvents.seq)).limit(300),
  ]);

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Audit log</h1>
          <p>Append-only. Each event stores the SHA-256 hash of the event before it, so an edit or deletion anywhere breaks the chain from that point on.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-outline btn-small" href="/app/audit/export?format=csv">
            Export CSV
          </Link>
          <Link className="btn btn-outline btn-small" href="/app/audit/export?format=json">
            Export JSON
          </Link>
        </div>
      </div>
      <div className="panel chain" role="status">
        {chain.ok ? (
          <span className="ok">Chain verified: {chain.events} events, no breaks.</span>
        ) : (
          <span className="warn">Chain broken at event {chain.brokenAtSeq}. Events from that point cannot be trusted.</span>
        )}
        <span className="hash">Head hash {chain.headHash.slice(0, 16)}...{chain.headHash.slice(-8)}</span>
        <span className="decide__hint">Verified just now by recomputing every hash from the first event.</span>
      </div>
      <section className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.seq}>
                <td className="r num">{e.seq}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {fmtDateTime(e.ts)}
                </td>
                <td>
                  {e.actorName}
                  <span className="cell-sub">{e.actorType}</span>
                </td>
                <td>{e.action}</td>
                <td>
                  {e.entityType === "alert" ? (
                    <Link className="num" href={`/app/alerts/${e.entityId}`}>
                      {e.entityId}
                    </Link>
                  ) : (
                    <span className="num">{e.entityId}</span>
                  )}
                </td>
                <td style={{ fontSize: 13, color: "var(--ink-2)" }}>{summarize(e.payload)}</td>
                <td className="hash">{e.hash.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
