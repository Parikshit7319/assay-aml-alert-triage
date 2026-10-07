import Link from "next/link";
import { teamWorkload, type WorkloadCounts } from "@/lib/collab";
import { requireTenant } from "@/lib/tenant";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", analyst: "Analyst", reviewer: "Reviewer" } as const;

function Age({ days, slaDays }: { days: number | null; slaDays: number }) {
  if (days == null) return <span className="cell-sub">Nothing open</span>;
  const late = days >= slaDays;
  return (
    <span className={late ? "sla-late" : undefined}>
      {days} {days === 1 ? "day" : "days"}
      {late ? ", past SLA" : ""}
    </span>
  );
}

function Counts({ c }: { c: WorkloadCounts }) {
  return (
    <>
      <td className="r num">{c.open}</td>
      <td className="r num">{c.triaged}</td>
      <td className="r num">{c.l2}</td>
    </>
  );
}

export default async function TeamPage() {
  const t = await requireTenant();
  const w = await teamWorkload(t.db, t.ws.id);
  const sla = t.ws.settings.internalSlaDays;
  const totalOpen = w.members.reduce((s, m) => s + m.open, 0) + w.unassigned.open;

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Team workload</h1>
          <p>
            Who owns what is open, what is waiting on L2, and how old the oldest open alert is against the {sla}-day internal SLA. Assign alerts from the alert page; decisions are counted under the name that made them.
          </p>
        </div>
      </div>

      <section className="panel table-wrap" aria-labelledby="team-h">
        <div className="panel__head">
          <h2 id="team-h">Members</h2>
          <span>
            {w.members.length} {w.members.length === 1 ? "member" : "members"}, {totalOpen} open {totalOpen === 1 ? "alert" : "alerts"}
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col" className="r">
                Open
              </th>
              <th scope="col" className="r">
                Ready for review
              </th>
              <th scope="col" className="r">
                In L2
              </th>
              <th scope="col" className="r">
                Decided, last 7 days
              </th>
              <th scope="col">Oldest open</th>
            </tr>
          </thead>
          <tbody>
            {w.members.map((m) => (
              <tr key={m.userId}>
                <th scope="row" style={{ fontWeight: 600, textAlign: "left" }}>
                  {m.name}
                  <span className="cell-sub">{ROLE_LABEL[m.role]}</span>
                </th>
                <Counts c={m} />
                <td className="r num">{m.decidedLast7d}</td>
                <td>
                  <Age days={m.oldestOpenDays} slaDays={sla} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" style={{ fontWeight: 600, textAlign: "left" }}>
                Unassigned
                <span className="cell-sub">No owner yet</span>
              </th>
              <Counts c={w.unassigned} />
              <td className="r num">{w.decidedLast7dOther || <span className="cell-sub">n/a</span>}</td>
              <td>
                <Age days={w.unassigned.oldestOpenDays} slaDays={sla} />
              </td>
            </tr>
          </tbody>
        </table>
        {w.decidedLast7dOther > 0 && (
          <p className="decide__hint" style={{ padding: "10px 16px", margin: 0 }}>
            {w.decidedLast7dOther} {w.decidedLast7dOther === 1 ? "decision" : "decisions"} in the last 7 days came from people who are not members of this workspace (for example the demo analyst), shown on the unassigned row.
          </p>
        )}
      </section>

      {t.mode === "demo" && (
        <p className="note" style={{ marginTop: 16 }}>
          The demo workspace has no member accounts, so every alert is unassigned and decisions show under the demo analyst. In an account workspace, any member can be made an alert&apos;s owner.
        </p>
      )}
      <p className="decide__hint" style={{ marginTop: 16 }}>
        Open counts new, ready-for-review and locked alerts. <Link href="/app">Go to the queue</Link> or <Link href="/app/l2">L2 investigations</Link>.
      </p>
    </>
  );
}
