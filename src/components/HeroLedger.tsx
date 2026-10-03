import { scenarioToBundle } from "@/lib/demo/bundle";
import { Ctx, heroStructuring, WATCHLIST } from "@/lib/demo/scenarios";
import { runTriage } from "@/lib/engine/pipeline";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { SimulatedProvider } from "@/lib/engine/providers/simulated";
import { DAY, newId, prng, usd } from "@/lib/util";

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const CHANNEL: Record<string, string> = { cash: "Cash", ach: "ACH", card: "Card", wire: "Wire", p2p: "P2P", check: "Check" };

/**
 * The hero is a real run of the engine on the demo's structuring case, using the
 * same simulated model the demo uses. Nothing in it is typed by hand.
 */
export async function HeroLedger() {
  const now = new Date();
  const c = new Ctx(prng(20261003), now);
  const s = heroStructuring(c, new Date(now.getTime() - 60 * 60 * 1000));
  const watchlist = WATCHLIST.map((w) => ({ ...w, id: newId("WL") }));
  const alertId = "ALT-7Q2M4K";
  const bundle = scenarioToBundle(s, watchlist, alertId);
  const result = await runTriage(bundle, DEFAULT_POLICY, new SimulatedProvider());
  const flagged = new Set(s.alert.triggeredTxnIds);
  const rows = bundle.transactions
    .filter((t) => s.alert.createdAt.getTime() - t.ts.getTime() <= 14 * DAY)
    .filter((t) => flagged.has(t.id) || t.channel !== "card" || t.amountCents > 9000)
    .slice(-14);
  let order = 0;
  const notes = result.rationale.slice(0, 3);

  return (
    <figure className="ledger" aria-label="Example: the agent working a structuring alert">
      <div className="ledger__head">
        <div>
          <strong>Alert {alertId}</strong>
          <span>Rule {s.alert.ruleCode}</span>
        </div>
        <span className="ledger__subject">
          {s.customer.name}, {s.customer.occupation?.toLowerCase()}
        </span>
      </div>
      <table className="ledger__table">
        <caption className="visually-hidden">Last 14 days of transactions. Highlighted rows are the deposits that triggered the alert.</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Detail</th>
            <th scope="col">Type</th>
            <th scope="col" className="ledger__amt">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const hit = flagged.has(t.id);
            const style = hit ? ({ "--i": order++ } as React.CSSProperties) : undefined;
            return (
              <tr key={t.id} className={hit ? "is-hit" : undefined} style={style}>
                <td className="num">{fmtDate(t.ts)}</td>
                <td>{t.branch ?? t.counterpartyName}</td>
                <td>{CHANNEL[t.channel]}</td>
                <td className="ledger__amt num">
                  {t.direction === "out" ? "-" : ""}
                  {usd(t.amountCents, { cents: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="ledger__notes">
        {notes.map((n, i) => (
          <p key={i} style={{ "--n": i } as React.CSSProperties}>
            {n.claim}{" "}
            <span className="ledger__cites">
              {n.citations.length > 3 ? (
                <>
                  <span className="stamp">
                    <span>{n.citations[0]}</span>
                  </span>{" "}
                  <span className="stamp stamp-muted">
                    <span>+{n.citations.length - 1} records</span>
                  </span>
                </>
              ) : (
                n.citations.map((id) => (
                  <span key={id} className="stamp">
                    <span>{id}</span>
                  </span>
                ))
              )}
            </span>
          </p>
        ))}
      </div>
      <figcaption className="ledger__foot">
        <span className="mark mark-escalate">
          <span>
            <strong>Escalate to L2</strong>
            <small>
              {Math.round(result.confidence * 100)}% confidence, {result.validation.checkedClaims} claims verified against records
            </small>
          </span>
        </span>
        <span className="ledger__foot-note">Synthetic case from the public demo. An analyst makes the decision.</span>
      </figcaption>
    </figure>
  );
}
