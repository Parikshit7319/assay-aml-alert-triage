import { NorthStarChart } from "@/components/app/NorthStarChart";
import { AUTONOMY_LEVELS } from "@/lib/engine/policy";
import { TYPOLOGY_LABEL } from "@/lib/labels";
import { HUMAN_DISAGREEMENT_BASELINE, L3_MIN_AGREEMENT, L3_MIN_QA, liveStats, typologyStats, weeklySeries } from "@/lib/metrics";
import { requireTenant } from "@/lib/tenant";

const pct = (x: number | null, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default async function MetricsPage() {
  const t = await requireTenant();
  const [weeks, types, live] = await Promise.all([weeklySeries(t.db, t.ws.id), typologyStats(t.db, t.ws.id), liveStats(t.db, t.ws.id)]);
  const manual = weeks.filter((w) => w.mode === "manual" && w.hoursPerSar != null).map((w) => w.hoursPerSar!);
  const assisted = weeks.filter((w) => w.mode === "assisted" && w.hoursPerSar != null);
  const baseline = avg(manual);
  const recent = avg(assisted.slice(-2).map((w) => w.hoursPerSar!));
  const change = baseline && recent ? (recent - baseline) / baseline : null;
  const assistedWeeks = weeks.filter((w) => w.mode === "assisted");
  const qaS = assistedWeeks.reduce((s, w) => s + w.qaSampled, 0);
  const missed = assistedWeeks.reduce((s, w) => s + w.missed, 0);
  const missedRate = qaS ? missed / qaS : null;
  const acc = assistedWeeks.reduce((s, w) => s + w.accepted, 0);
  const ovr = assistedWeeks.reduce((s, w) => s + w.overridden, 0);
  const overrideRate = acc + ovr ? ovr / (acc + ovr) : null;
  const synthetic = weeks.some((w) => w.synthetic);
  const monthlyAlerts = weeks.length ? Math.round((weeks.slice(-4).reduce((s, w) => s + w.alerts, 0) / Math.min(4, weeks.length)) * 4.33) : 0;

  return (
    <>
      <div className="app-head">
        <div>
          <h1>Metrics</h1>
          <p>
            The north star is analyst hours per confirmed suspicious case: all L1 and L2 time divided by the escalations that end in a SAR. It falls when noise clears faster, and rises if the agent buries real cases or pushes work onto L2.
          </p>
        </div>
      </div>
      {synthetic && (
        <p className="note" style={{ marginBottom: 16 }}>
          Weekly history in this workspace is synthetic, generated at the volume of a team with about 15 L1 analysts (roughly 4,000 alerts a month). The panels marked &ldquo;this workspace&rdquo; are computed live from what you do here.
        </p>
      )}

      <div className="metric-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Analyst hours per confirmed suspicious case</h2>
            <span>weekly</span>
          </div>
          <div className="ns-value">
            <b>{recent != null ? `${recent.toFixed(1)} h` : "n/a"}</b>
            <span>
              last two assisted weeks
              {baseline != null && change != null ? `, ${change < 0 ? "down" : "up"} ${Math.abs(change * 100).toFixed(0)}% from the ${baseline.toFixed(1)} h manual baseline` : ""}
            </span>
          </div>
          {weeks.length ? (
            <div style={{ padding: "0 8px 8px" }}>
              <NorthStarChart points={weeks.map((w) => ({ weekStart: w.weekStart, mode: w.mode, value: w.hoursPerSar, alerts: w.alerts, sars: w.sars, hours: w.l1Hours + w.l2Hours }))} baseline={baseline} />
            </div>
          ) : (
            <div className="empty">No weekly history yet. Rollups run nightly once alerts are decided.</div>
          )}
          <details className="disclose" style={{ borderTop: "1px solid var(--rule)" }}>
            <summary>Show as a table</summary>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th>Mode</th>
                    <th className="r">Alerts</th>
                    <th className="r">Escalations</th>
                    <th className="r">SARs</th>
                    <th className="r">L1 hours</th>
                    <th className="r">L2 hours</th>
                    <th className="r">Hours per SAR</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.weekStart}>
                      <td className="num">{w.weekStart}</td>
                      <td>{w.mode}</td>
                      <td className="r num">{w.alerts.toLocaleString()}</td>
                      <td className="r num">{w.escalations}</td>
                      <td className="r num">{w.sars}</td>
                      <td className="r num">{Math.round(w.l1Hours).toLocaleString()}</td>
                      <td className="r num">{Math.round(w.l2Hours).toLocaleString()}</td>
                      <td className="r num">{w.hoursPerSar?.toFixed(1) ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Guardrails</h2>
            <span>a win on the north star only counts if these hold</span>
          </div>
          <ul className="guard">
            <li>
              Missed escalations on QA&apos;d agent closes
              <b className={missedRate != null && missedRate <= HUMAN_DISAGREEMENT_BASELINE ? "ok" : "warn"}>{pct(missedRate)}</b>
              <small>Must stay at or under the human-to-human disagreement baseline of {pct(HUMAN_DISAGREEMENT_BASELINE)} (modeled; replace with your QA data).</small>
            </li>
            <li>
              Claims that resolve to a record, this workspace
              <b className={live.citationValidRate === 1 ? "ok" : "warn"}>{pct(live.citationValidRate)}</b>
              <small>Target 100%. Any miss sends the alert to human review.</small>
            </li>
            <li>
              Override rate, assisted weeks
              <b className={overrideRate != null && overrideRate >= 0.02 && overrideRate <= 0.15 ? "ok" : "warn"}>{pct(overrideRate)}</b>
              <small>Healthy band is 2% to 15%. Near zero suggests rubber-stamping; above 15% means the agent is not helping.</small>
            </li>
            <li>
              Injection attempts stopped before the model, this workspace
              <b className="ok">{live.lockedRuns}</b>
              <small>Alerts locked to a human because customer text read like instructions.</small>
            </li>
            <li>
              SAR deadlines missed
              <b className={live.sarBreaches === 0 ? "ok" : "warn"}>{live.sarBreaches}</b>
              <small>Target zero. Counted from L2 determination, per the FFIEC manual.</small>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Agreement by alert type and progress toward the next autonomy level</h2>
          <span>
            L3 needs {pct(L3_MIN_AGREEMENT, 0)} agreement on {L3_MIN_QA.toLocaleString()} QA-reviewed alerts
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Alert type</th>
                <th>Current level</th>
                <th className="r">Alerts</th>
                <th className="r">Escalation rate</th>
                <th className="r">Shadow agreement</th>
                <th className="r">QA agreement</th>
                <th>QA-reviewed toward L3</th>
              </tr>
            </thead>
            <tbody>
              {types
                .sort((a, b) => b.alerts - a.alerts)
                .map((s) => {
                  const level = t.ws.settings.autonomy[s.typology];
                  const progress = Math.min(1, s.qaSampled / L3_MIN_QA);
                  return (
                    <tr key={s.typology}>
                      <td>{TYPOLOGY_LABEL[s.typology]}</td>
                      <td>
                        L{level} {AUTONOMY_LEVELS[level].name}
                      </td>
                      <td className="r num">{s.alerts.toLocaleString()}</td>
                      <td className="r num">{pct(s.escalationRate)}</td>
                      <td className="r num">{pct(s.shadowAgreement)}</td>
                      <td className="r num">
                        <span className={s.qaAgreement != null && s.qaAgreement >= L3_MIN_AGREEMENT ? "ok" : undefined}>{pct(s.qaAgreement)}</span>
                      </td>
                      <td>
                        <span className="progress" aria-hidden="true">
                          <i style={{ width: `${progress * 100}%` }} />
                        </span>{" "}
                        <span className="num">
                          {s.qaSampled.toLocaleString()} of {L3_MIN_QA.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="metric-grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel__head">
            <h2>This workspace, live</h2>
            <span>computed from your actions</span>
          </div>
          <ul className="guard">
            <li>
              Agent runs <b className="num">{live.runs}</b>
            </li>
            <li>
              L1 decisions in this workspace <b className="num">{live.humanDecisions}</b>
            </li>
            <li>
              Agreement with the model&apos;s recommendation <b className="num">{pct(live.agreementRate)}</b>
            </li>
            <li>
              Overrides <b className="num">{live.overrides}</b>
            </li>
            <li>
              QA reviews completed <b className="num">{live.qaReviewed ? `${live.qaAgreed} agree of ${live.qaReviewed}` : "0"}</b>
            </li>
          </ul>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Unit economics</h2>
            <span>{live.costEstimated ? "estimated at Claude Sonnet 5.5 list price" : "metered"}</span>
          </div>
          <ul className="guard">
            <li>
              Average model cost per alert <b className="num">${live.avgCostUsd.toFixed(4)}</b>
            </li>
            <li>
              Average prompt size <b className="num">{live.avgInputTokens.toLocaleString()} tokens</b>
            </li>
            <li>
              Model cost at {monthlyAlerts.toLocaleString()} alerts a month <b className="num">${(live.avgCostUsd * monthlyAlerts).toFixed(0)}</b>
              <small>Against the Team plan price, this is the gross-margin line to watch. Target: under $0.15 per alert.</small>
            </li>
            <li>
              p95 run time <b className="num">{live.p95LatencyMs != null ? `${live.p95LatencyMs} ms` : "n/a"}</b>
              <small>Simulated runs are near-instant; live model calls add 3 to 20 seconds.</small>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
