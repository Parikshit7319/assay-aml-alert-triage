"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { batchCloseAction, type ActionState } from "@/app/app/actions";
import type { Typology } from "@/lib/db/schema";
import { ago, daysLeft, REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import type { QueueRow } from "@/lib/queries";

type Row = Omit<QueueRow, "createdAt" | "slaDueAt" | "sarDueAt"> & { createdAt: string; slaDueAt: string; sarDueAt: string | null };

export function QueueTable({
  rows,
  shadow,
  batchableCount,
  qaRate,
  selectable,
}: {
  rows: Row[];
  shadow: Record<Typology, boolean>;
  batchableCount: number;
  qaRate: number;
  selectable: boolean;
}) {
  const eligible = useMemo(() => rows.filter((r) => r.batchEligible && r.status === "triaged" && !shadow[r.typology]).map((r) => r.id), [rows, shadow]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<ActionState, FormData>(batchCloseAction, {});
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = eligible.length > 0 && eligible.every((id) => selected.has(id));
  const sampleSize = Math.max(1, Math.ceil(selected.size * qaRate));

  if (!rows.length) {
    return (
      <div className="panel empty">
        <h2>Nothing here</h2>
        <p>
          No alerts match this view. Import alerts from your monitoring system on the <Link href="/app/import">Import</Link> page, or send them through the API.
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      {selectable && batchableCount > 0 && (
        <div className="panel summary" style={{ marginBottom: 12 }}>
          <div className="summary__item">
            <b>{batchableCount}</b>
            <span>eligible for batch approval</span>
          </div>
          <div className="summary__action">
            <small>
              Only high-confidence closes on alert types at autonomy level 2 or above. {Math.round(qaRate * 100)}% of every batch is drawn for QA, at least one alert.
            </small>
            <button type="button" className="btn btn-outline btn-small" onClick={() => setSelected(allOn ? new Set() : new Set(eligible))}>
              {allOn ? "Clear selection" : "Select all eligible"}
            </button>
            <button className="btn btn-close btn-small" type="submit" disabled={!selected.size || pending}>
              {pending ? "Closing" : `Approve ${selected.size || ""} close${selected.size === 1 ? "" : "s"}`.replace("  ", " ")}
            </button>
          </div>
        </div>
      )}
      {selected.size > 0 && <p className="decide__hint" style={{ margin: "0 0 10px" }}>{sampleSize} of the selected will be sampled for QA review.</p>}
      {state.error && <p className="form-error toast">{state.error}</p>}
      {state.ok && <p className="form-ok toast">{state.ok}</p>}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="alertId" value={id} />
      ))}
      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              {selectable && <th aria-label="Select" />}
              <th>Alert</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Agent recommends</th>
              <th>Confidence</th>
              <th className="r">Risk</th>
              <th>Age</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hidden = shadow[r.typology] && ["triaged", "locked", "new"].includes(r.status);
              const canSelect = eligible.includes(r.id);
              const slaDays = daysLeft(new Date(r.slaDueAt));
              return (
                <tr key={r.id}>
                  {selectable && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.id} for batch close`}
                        disabled={!canSelect}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        title={canSelect ? "Eligible for batch close" : "Not eligible for batch close"}
                      />
                    </td>
                  )}
                  <td>
                    <Link className="row-link num" href={`/app/alerts/${r.id}`}>
                      {r.id}
                    </Link>
                    <span className="cell-sub">
                      {r.ruleCode}: {r.ruleDescription}
                    </span>
                  </td>
                  <td>
                    {r.customerName}
                    <span className="cell-sub">{r.customerKind}</span>
                  </td>
                  <td>{TYPOLOGY_LABEL[r.typology]}</td>
                  <td>
                    {hidden ? (
                      <span className="rec rec-hidden">Hidden in shadow mode</span>
                    ) : r.recommendation ? (
                      <span className={`rec rec-${r.recommendation}`}>
                        {r.outcome === "locked" ? "Locked to human" : r.outcome === "abstained" ? "Abstained" : REC_LABEL[r.recommendation]}
                      </span>
                    ) : (
                      <span className="rec rec-hidden">Not triaged</span>
                    )}
                    {!hidden && r.modelRecommendation && r.modelRecommendation !== r.recommendation && (
                      <span className="cell-sub">Model said {r.modelRecommendation}; policy changed it</span>
                    )}
                  </td>
                  <td>
                    {!hidden && r.confidence != null && r.outcome === "completed" ? (
                      <span className="conf">
                        <span className="conf__bar" aria-hidden="true">
                          <i style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                        </span>
                        {Math.round(r.confidence * 100)}%
                      </span>
                    ) : (
                      <span className="cell-sub">n/a</span>
                    )}
                  </td>
                  <td className="r num">{hidden ? "" : (r.riskScore ?? "")}</td>
                  <td className="num">
                    {ago(new Date(r.createdAt))}
                    {["new", "triaged", "locked"].includes(r.status) && (
                      <span className={`cell-sub ${slaDays <= 3 ? "sla-late" : ""}`}>{slaDays >= 0 ? `${slaDays} d to SLA` : `${-slaDays} d past SLA`}</span>
                    )}
                  </td>
                  <td>{STATUS_LABEL[r.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
