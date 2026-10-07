import Link from "next/link";
import { AUTONOMY_LEVELS } from "@/lib/engine/policy";
import { TYPOLOGY_LABEL } from "@/lib/labels";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { loadDecidedAlerts } from "@/lib/reports";
import { shadowReport, type ConfusionMatrix } from "@/lib/shadow-metrics";
import { requireTenant } from "@/lib/tenant";

const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`);
const levelName = (l: number) => AUTONOMY_LEVELS.find((x) => x.level === l)?.name ?? `L${l}`;

function Matrix({ m }: { m: ConfusionMatrix }) {
  const closes = m.agentClose_humanClose + m.agentClose_humanEscalate;
  const escs = m.agentEscalate_humanClose + m.agentEscalate_humanEscalate;
  const reviews = m.review_humanClose + m.review_humanEscalate;
  const humanClose = m.agentClose_humanClose + m.agentEscalate_humanClose + m.review_humanClose;
  const humanEsc = m.agentClose_humanEscalate + m.agentEscalate_humanEscalate + m.review_humanEscalate;
  return (
    <table className="table">
      <caption className="visually-hidden">Agent recommendation by row, analyst decision by column</caption>
      <thead>
        <tr>
          <th scope="col">Agent recommended</th>
          <th scope="col" className="r">
            Analyst closed
          </th>
          <th scope="col" className="r">
            Analyst escalated
          </th>
          <th scope="col" className="r">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" style={{ textAlign: "left" }}>
            <span className="rec rec-close">Close</span>
          </th>
          <td className="r num">
            {m.agentClose_humanClose}
            <span className="cell-sub">agree</span>
          </td>
          <td className="r num" style={m.agentClose_humanEscalate ? { background: "var(--red-wash)" } : undefined}>
            <span className={m.agentClose_humanEscalate ? "sla-late" : undefined}>{m.agentClose_humanEscalate}</span>
            <span className="cell-sub">missed escalation</span>
          </td>
          <td className="r num">{closes}</td>
        </tr>
        <tr>
          <th scope="row" style={{ textAlign: "left" }}>
            <span className="rec rec-escalate">Escalate</span>
          </th>
          <td className="r num">
            {m.agentEscalate_humanClose}
            <span className="cell-sub">over-escalation</span>
          </td>
          <td className="r num">
            {m.agentEscalate_humanEscalate}
            <span className="cell-sub">agree</span>
          </td>
          <td className="r num">{escs}</td>
        </tr>
        <tr>
          <th scope="row" style={{ textAlign: "left" }}>
            <span className="rec rec-human_review">Needs review</span>
          </th>
          <td className="r num">{m.review_humanClose}</td>
          <td className="r num">{m.review_humanEscalate}</td>
          <td className="r num">{reviews}</td>
        </tr>
        <tr>
          <th scope="row" style={{ textAlign: "left" }}>
            Total
          </th>
          <td className="r num">{humanClose}</td>
          <td className="r num">{humanEsc}</td>
          <td className="r num">
            <b>{m.total}</b>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default async function ShadowPage() {
  const t = await requireTenant();
  const report = shadowReport(await loadDecidedAlerts(t.db, t.ws.id), t.ws.settings.autonomy);
  const m = report.overall;
  const inShadow = report.shadowTypologies.map((ty) => TYPOLOGY_LABEL[ty]);

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Shadow mode</h1>
          <p>
            The agent&apos;s recommendation against the analyst&apos;s final call on every decided alert. This is the evidence for moving an alert type up the autonomy ladder, or back down it. The number to watch is missed escalations: the agent said close and a person escalated.
          </p>
        </div>
      </div>

      <div className="note" style={{ marginBottom: 16 }} role="note">
        {inShadow.length ? (
          <>
            In shadow now (L0): <b>{inShadow.join(", ")}</b>. The agent runs on these alerts, but analysts do not see its output until they have decided, so agreement on them is unanchored.
          </>
        ) : (
          <>
            No alert type is at L0 right now, so analysts saw the agent&apos;s recommendation before deciding on every alert below. Agreement can be anchored by that. To measure a type blind, set it to L0 under <Link href="/app/settings">Policy and autonomy</Link>.
          </>
        )}
      </div>

      <section className="panel summary" aria-label="Agreement summary">
        <div className="summary__item">
          <b className="num">{m.total}</b>
          <span>Decided alerts compared</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.agreementRate)}</b>
          <span>Agreement where the agent decided</span>
        </div>
        <div className="summary__item">
          <b className={`num${m.missedEscalationRate ? " sla-late" : ""}`}>{pct(m.missedEscalationRate)}</b>
          <span>Missed escalations, of agent closes</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.overEscalationRate)}</b>
          <span>Over-escalations, of agent escalations</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.reviewRate)}</b>
          <span>Sent to human review</span>
        </div>
      </section>

      <div className="metric-grid">
        <section className="panel table-wrap" aria-labelledby="cm-h">
          <div className="panel__head">
            <h2 id="cm-h">Agent versus analyst</h2>
            <span>all alert types</span>
          </div>
          {m.total ? (
            <Matrix m={m} />
          ) : (
            <div className="empty">
              <h2>Nothing to compare yet</h2>
              <p>
                Decide a few alerts from the <Link href="/app">queue</Link>. Each close or escalation is compared with the agent&apos;s recommendation for that alert.
              </p>
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="how-h">
          <div className="panel__head">
            <h2 id="how-h">How this is counted</h2>
          </div>
          <div className="panel__body">
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>
              <li>Each alert counts once, at its first L1 decision, against the agent run that decision was made on.</li>
              <li>Agreement and both error rates leave out alerts the agent sent to human review; the review rate covers them.</li>
              <li>Batch closes count as analyst closes. They approve the agent&apos;s own answer, so they raise agreement by design.</li>
              <li>Auto-closed alerts have no analyst decision and are left out{report.skipped ? `, along with alerts the agent never ran on (${report.skipped} in all)` : ""}.</li>
              <li>
                Promotion to L3 needs {Math.round(L3_MIN_AGREEMENT * 100)}% QA agreement on at least {L3_MIN_QA.toLocaleString("en-US")} reviewed alerts of that type and a written sign-off.
              </li>
            </ul>
          </div>
        </section>
      </div>

      <section className="panel table-wrap" style={{ marginTop: 16 }} aria-labelledby="ty-h">
        <div className="panel__head">
          <h2 id="ty-h">By alert type</h2>
          <span>{report.byTypology.length} types</span>
        </div>
        {report.byTypology.length ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Alert type</th>
                <th scope="col">Autonomy</th>
                <th scope="col" className="r">
                  Compared
                </th>
                <th scope="col" className="r">
                  Agreement
                </th>
                <th scope="col" className="r">
                  Missed escalations
                </th>
                <th scope="col" className="r">
                  Over-escalations
                </th>
                <th scope="col" className="r">
                  Human review
                </th>
              </tr>
            </thead>
            <tbody>
              {report.byTypology.map((r) => (
                <tr key={r.typology}>
                  <th scope="row" style={{ textAlign: "left", fontWeight: 600 }}>
                    {TYPOLOGY_LABEL[r.typology]}
                  </th>
                  <td>
                    L{r.level} {levelName(r.level)}
                    {r.inShadow && <span className="cell-sub">Output hidden from analysts</span>}
                  </td>
                  <td className="r num">{r.matrix.total}</td>
                  <td className="r num">{pct(r.matrix.agreementRate)}</td>
                  <td className="r num">
                    <span className={r.matrix.agentClose_humanEscalate ? "sla-late" : undefined}>{pct(r.matrix.missedEscalationRate)}</span>
                    <span className="cell-sub">{r.matrix.agentClose_humanEscalate} of {r.matrix.agentClose_humanClose + r.matrix.agentClose_humanEscalate}</span>
                  </td>
                  <td className="r num">{pct(r.matrix.overEscalationRate)}</td>
                  <td className="r num">{pct(r.matrix.reviewRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <p>No decided alerts yet.</p>
          </div>
        )}
      </section>
      <p className="decide__hint" style={{ marginTop: 16 }}>
        Small samples are noisy; read every rate with its count. The <a href="/app/export/model-risk">model risk pack</a> carries these numbers for review.
      </p>
    </>
  );
}
