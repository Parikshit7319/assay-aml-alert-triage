import Link from "next/link";
import { QueueTable } from "@/components/app/QueueTable";
import { TriageQueueButton } from "@/components/app/TriageQueueButton";
import type { AlertStatus, Typology } from "@/lib/db/schema";
import { TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { OPEN, queueRows } from "@/lib/queries";
import { requireTenant } from "@/lib/tenant";
import { listMembers } from "@/lib/collab";
import { batchCloseAction } from "./actions";

const VIEWS: Record<string, { label: string; statuses: AlertStatus[] }> = {
  open: { label: "Open", statuses: OPEN },
  closed: { label: "Closed", statuses: ["closed", "no_sar"] },
  escalated: { label: "Escalated", statuses: ["escalated", "sar_filed"] },
};

export default async function QueuePage(props: PageProps<"/app">) {
  const t = await requireTenant();
  const sp = await props.searchParams;
  const view = typeof sp.view === "string" && VIEWS[sp.view] ? sp.view : "open";
  const typ = typeof sp.typ === "string" && (TYPOLOGIES as string[]).includes(sp.typ) ? (sp.typ as Typology) : null;
  const [all, members] = await Promise.all([queueRows(t.db, t.ws.id, VIEWS[view].statuses), listMembers(t.db, t.ws.id)]);
  const rows = typ ? all.filter((r) => r.typology === typ) : all;
  const shadow = Object.fromEntries(TYPOLOGIES.map((ty) => [ty, t.ws.settings.autonomy[ty] === 0])) as Record<Typology, boolean>;

  const open = view === "open" ? all : [];
  const recClose = open.filter((r) => r.recommendation === "close" && !shadow[r.typology]);
  const batchable = recClose.filter((r) => r.batchEligible);
  const recEsc = open.filter((r) => r.recommendation === "escalate" && !shadow[r.typology]);
  const review = open.filter((r) => r.recommendation === "human_review" || !r.recommendation || shadow[r.typology]);
  const untriaged = open.filter((r) => r.status === "new").length;

  const href = (v: string, ty: string | null) => `/app?view=${v}${ty ? `&typ=${ty}` : ""}`;

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Alert queue</h1>
          <p>Sorted by agent risk score. Open an alert to see the evidence behind each claim.</p>
        </div>
        {untriaged > 0 && <TriageQueueButton count={untriaged} />}
      </div>

      {view === "open" && (
        <div className="panel summary" aria-label="Queue summary">
          <div className="summary__item">
            <b>{open.length}</b>
            <span>open alerts</span>
          </div>
          <div className="summary__item">
            <b className="rec-close" style={{ color: "var(--green)" }}>
              {recClose.length}
            </b>
            <span>recommended close</span>
          </div>
          <div className="summary__item">
            <b style={{ color: "var(--red)" }}>{recEsc.length}</b>
            <span>recommended escalate</span>
          </div>
          <div className="summary__item">
            <b style={{ color: "var(--amber)" }}>{review.length}</b>
            <span>need your judgment</span>
          </div>
        </div>
      )}

      <div className="filters" role="navigation" aria-label="Filters">
        {Object.entries(VIEWS).map(([k, v]) => (
          <Link key={k} href={href(k, typ)} aria-current={view === k ? "true" : undefined}>
            {v.label}
          </Link>
        ))}
      </div>

      <QueueTable
        rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), slaDueAt: r.slaDueAt.toISOString(), sarDueAt: r.sarDueAt?.toISOString() ?? null }))}
        shadow={shadow}
        batchableCount={view === "open" ? batchable.length : 0}
        qaRate={t.ws.settings.qaSampleRate}
        selectable={view === "open"}
        batchAction={batchCloseAction}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        currentUserId={t.user?.id}
      />
    </>
  );
}
