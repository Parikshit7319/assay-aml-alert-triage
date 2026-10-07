"use client";

import { useId, useMemo, useState } from "react";
import { Icon } from "@/components/viz/Icon";
import type { Typology } from "@/lib/db/schema";
import { confusionMatrix, type ConfusionMatrix, type ShadowRow } from "@/lib/demo/shadow";
import { TYPOLOGY_LABEL } from "@/lib/labels";
import { HUMAN_DISAGREEMENT_BASELINE, L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { Time } from "./Time";
import "./workbench.css";

export interface ShadowViewProps {
  rows: ShadowRow[];
  /** Alert types offered in the filter, in display order. */
  typologies: Typology[];
}

const pct = (x: number | null, d = 1) => (x == null ? "n/a" : `${(x * 100).toFixed(d)}%`);
const share = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "0%");

type CellKind = "agree" | "missed" | "over" | "review";
const CELL_WORD: Record<CellKind, string> = { agree: "Agree", missed: "Missed escalation", over: "Over-escalation", review: "Sent to an analyst" };

function Cell({ n, total, kind }: { n: number; total: number; kind: CellKind }) {
  return (
    <td className={`wb-cm__cell wb-cm__cell--${kind}`}>
      <b className="num">{n}</b>
      <span className="num">{share(n, total)} of alerts</span>
      <small>{CELL_WORD[kind]}</small>
    </td>
  );
}

function Matrix({ m, caption }: { m: ConfusionMatrix; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="wb-cm">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">Analyst closed</th>
            <th scope="col">Analyst escalated</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              Agent recommended <span className="rec rec-close">close</span>
            </th>
            <Cell n={m.agentClose_humanClose} total={m.total} kind="agree" />
            <Cell n={m.agentClose_humanEscalate} total={m.total} kind="missed" />
          </tr>
          <tr>
            <th scope="row">
              Agent recommended <span className="rec rec-escalate">escalate</span>
            </th>
            <Cell n={m.agentEscalate_humanClose} total={m.total} kind="over" />
            <Cell n={m.agentEscalate_humanEscalate} total={m.total} kind="agree" />
          </tr>
          <tr>
            <th scope="row">
              Agent sent to <span className="rec rec-human_review">review</span>
            </th>
            <Cell n={m.review_humanClose} total={m.total} kind="review" />
            <Cell n={m.review_humanEscalate} total={m.total} kind="review" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Shadow-mode results: how the agent's recommendations compare with analysts
 * who decided blind. A confusion matrix, agreement, missed escalations
 * called out with the alerts behind them, over-escalation and review rates,
 * and a per-type table.
 */
export function ShadowView({ rows, typologies }: ShadowViewProps) {
  const ids = useId();
  const [typ, setTyp] = useState<Typology | "all">("all");
  const m = useMemo(() => confusionMatrix(rows, typ === "all" ? undefined : typ), [rows, typ]);
  const missed = useMemo(() => rows.filter((r) => (typ === "all" || r.typology === typ) && r.agent === "close" && r.human === "escalate"), [rows, typ]);
  const perType = useMemo(
    () =>
      typologies
        .map((t) => ({ t, m: confusionMatrix(rows, t) }))
        .filter((x) => x.m.total > 0)
        .sort((a, b) => b.m.total - a.m.total),
    [rows, typologies],
  );
  const scope = typ === "all" ? "all alert types" : TYPOLOGY_LABEL[typ];

  return (
    <div className="wb-shadow">
      <div className="wb-shadow__bar">
        <label className="wb-sort">
          <span>Alert type</span>
          <select value={typ} onChange={(e) => setTyp(e.target.value as Typology | "all")}>
            <option value="all">All alert types</option>
            {typologies.map((t) => (
              <option key={t} value={t}>
                {TYPOLOGY_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <p className="wb-foot-note wb-foot-note--flush">Synthetic history: the real engine triaged each alert, and a simulated analyst decided it without seeing the agent&apos;s answer.</p>
      </div>

      <div className="panel summary" aria-live="polite">
        <div className="summary__item">
          <b className="num">{m.total}</b>
          <span>alerts, {scope}</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.agreementRate)}</b>
          <span>agreement where the agent decided</span>
        </div>
        <div className="summary__item">
          <b className={`num ${m.agentClose_humanEscalate ? "wb-red" : ""}`}>{pct(m.missedEscalationRate)}</b>
          <span>missed escalations, of agent closes</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.overEscalationRate)}</b>
          <span>over-escalation, of agent escalations</span>
        </div>
        <div className="summary__item">
          <b className="num">{pct(m.reviewRate)}</b>
          <span>sent to an analyst</span>
        </div>
      </div>

      <div className="wb-shadow__grid">
        <section className="panel" aria-labelledby={`${ids}-cm`}>
          <div className="panel__head">
            <h2 id={`${ids}-cm`}>Agent versus analyst</h2>
            <span>{scope}</span>
          </div>
          <div className="panel__body">
            <Matrix m={m} caption={`Agent recommendation by analyst decision, ${scope}`} />
          </div>
        </section>

        <section className="panel" aria-labelledby={`${ids}-how`}>
          <div className="panel__head">
            <h2 id={`${ids}-how`}>How to read this</h2>
          </div>
          <div className="panel__body wb-shadow__how">
            <p>
              Rows are what the agent recommended; columns are what the analyst decided without seeing it. The two <span className="wb-swatch wb-swatch--agree">Agree</span> cells are the diagonal.
            </p>
            <p>
              <span className="wb-swatch wb-swatch--missed">Missed escalation</span> is the cell a regulator asks about: the agent said close and a person said escalate. The guardrail holds it at or under the rate at which two analysts disagree with each other, modeled at {pct(HUMAN_DISAGREEMENT_BASELINE, 0)}.
            </p>
            <p>
              <span className="wb-swatch wb-swatch--over">Over-escalation</span> costs L2 time but hides nothing. The review row is work the agent handed back on purpose.
            </p>
            <p>
              Shadow agreement is the first gate. An alert type moves to L3 auto-close only with {L3_MIN_QA.toLocaleString("en-US")} QA reviews at {Math.round(L3_MIN_AGREEMENT * 100)}% agreement, plus written sign-off.
            </p>
          </div>
        </section>
      </div>

      <section className="panel wb-shadow__missed" aria-labelledby={`${ids}-missed`}>
        <div className="panel__head">
          <h2 id={`${ids}-missed`}>
            <Icon name="escalate" size={16} /> Missed escalations
          </h2>
          <span className={missed.length ? "wb-red" : undefined}>{missed.length ? `${missed.length} alert${missed.length === 1 ? "" : "s"}, agent closed, analyst escalated` : "none"}</span>
        </div>
        {missed.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="r">Agent confidence</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {missed.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.id}</td>
                    <td>{r.customerName}</td>
                    <td>{TYPOLOGY_LABEL[r.typology]}</td>
                    <td className="r num">{Math.round(r.confidence * 100)}%</td>
                    <td className="num">
                      <Time value={r.createdAt} format="date" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="wb-foot-note">The agent closed nothing an analyst escalated{typ === "all" ? "" : ` for ${scope}`}.</p>
        )}
      </section>

      <section className="panel" aria-labelledby={`${ids}-types`}>
        <div className="panel__head">
          <h2 id={`${ids}-types`}>By alert type</h2>
          <span>select a row to focus the matrix</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Alert type</th>
                <th className="r">Alerts</th>
                <th className="r">Agreement</th>
                <th className="r">Missed escalations</th>
                <th className="r">Over-escalation</th>
                <th className="r">Sent to an analyst</th>
              </tr>
            </thead>
            <tbody>
              {perType.map(({ t, m: tm }) => (
                <tr key={t} aria-current={typ === t ? "true" : undefined} className={typ === t ? "wb-row-current" : undefined}>
                  <td>
                    <button type="button" className="wb-linkbtn" onClick={() => setTyp(typ === t ? "all" : t)} aria-pressed={typ === t}>
                      {TYPOLOGY_LABEL[t]}
                    </button>
                  </td>
                  <td className="r num">{tm.total}</td>
                  <td className="r num">{pct(tm.agreementRate)}</td>
                  <td className={`r num ${tm.agentClose_humanEscalate ? "wb-red" : ""}`}>
                    {tm.agentClose_humanEscalate} ({pct(tm.missedEscalationRate)})
                  </td>
                  <td className="r num">{pct(tm.overEscalationRate)}</td>
                  <td className="r num">{pct(tm.reviewRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
