"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { BatchBar, QueueCards, WB_ONLY_NARROW, WB_ONLY_WIDE } from "@/components/workbench/QueueCards";
import { QueueFilters } from "@/components/workbench/QueueFilters";
import { applyQueueFilters, countFacets, DEFAULT_FILTERS, type QueueFilterState } from "@/components/workbench/queue-filter";
import { useToast } from "@/components/workbench/Toasts";
import { useHotkeys } from "@/components/workbench/useHotkeys";
import { Time } from "@/components/workbench/Time";
import type { ActionState } from "@/lib/action-types";
import type { Typology } from "@/lib/db/schema";
import { daysLeft, REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import type { QueueRow } from "@/lib/queries";

type Row = Omit<QueueRow, "createdAt" | "slaDueAt" | "sarDueAt"> & { createdAt: string; slaDueAt: string; sarDueAt: string | null };

const OPEN_STATUSES = ["new", "triaged", "locked"];

export function QueueTable({
  rows,
  shadow,
  batchableCount,
  qaRate,
  selectable,
  batchAction,
  alertHref = (id: string) => `/app/alerts/${id}`,
  onOpen,
  members,
  currentUserId,
  storageKey = "assay.queue.views",
  filterable = true,
  emptyHint,
}: {
  batchAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  alertHref?: (id: string) => string;
  onOpen?: (id: string) => void;
  rows: Row[];
  shadow: Record<Typology, boolean>;
  batchableCount: number;
  qaRate: number;
  selectable: boolean;
  members?: { id: string; name: string }[];
  currentUserId?: string;
  storageKey?: string;
  filterable?: boolean;
  emptyHint?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [filters, setFilters] = useState<QueueFilterState>(DEFAULT_FILTERS);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const showStatus = rows.some((r) => !OPEN_STATUSES.includes(r.status));
  const isHidden = (r: Row) => shadow[r.typology] && OPEN_STATUSES.includes(r.status);
  const ctx = useMemo(() => ({ currentUserId, now: new Date() }), [currentUserId]);
  const visible = useMemo(() => (filterable ? applyQueueFilters(rows, filters, ctx) : rows), [rows, filters, ctx, filterable]);
  const counts = useMemo(() => (filterable ? countFacets(rows, ctx) : {}), [rows, ctx, filterable]);

  const eligible = useMemo(() => rows.filter((r) => r.batchEligible && r.status === "triaged" && !shadow[r.typology]).map((r) => r.id), [rows, shadow]);
  const [picked, setSelected] = useState<Set<string>>(new Set());
  // Alerts that stop being eligible (for example after a batch closes them) drop out of the selection.
  const selected = useMemo(() => new Set([...picked].filter((id) => eligible.includes(id))), [picked, eligible]);
  const [state, action, pending] = useActionState<ActionState, FormData>(batchAction, {});
  const lastState = useRef<ActionState>(state);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.error) toast({ title: "Batch not approved", body: state.error, tone: "error" });
    if (state.ok) toast({ title: "Batch approved", body: state.ok, tone: "ok" });
  }, [state, toast]);

  const toggle = (id: string) =>
    setSelected(() => {
      const n = new Set(selected);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = eligible.length > 0 && eligible.every((id) => selected.has(id));
  const sampleSize = Math.max(1, Math.ceil(selected.size * qaRate));
  const open = (id: string) => (onOpen ? onOpen(id) : router.push(alertHref(id)));

  const clamp = (i: number) => Math.max(0, Math.min(visible.length - 1, i));
  const moveTo = (i: number) => {
    const n = clamp(i);
    setCursor(n);
    const row = tableRef.current?.querySelectorAll("tr")[n];
    row?.scrollIntoView({ block: "nearest" });
  };
  useHotkeys(
    {
      j: () => moveTo(cursor + 1),
      k: () => moveTo(cursor - 1),
      enter: () => visible[cursor] && open(visible[cursor].id),
      x: () => {
        const r = visible[cursor];
        if (r && selectable && eligible.includes(r.id)) toggle(r.id);
      },
      "/": (e) => {
        e.preventDefault();
        searchRef.current?.focus();
      },
    },
    { enabled: visible.length > 0 },
  );

  const submitBatch = () => {
    const fd = new FormData();
    selected.forEach((id) => fd.append("alertId", id));
    startTransition(() => action(fd));
  };

  return (
    <div data-tour="queue">
      {filterable && (
        <QueueFilters value={filters} onChange={(f) => (setFilters(f), setCursor(0))} members={members} counts={counts} storageKey={storageKey} searchRef={searchRef} resultCount={visible.length} totalCount={rows.length} />
      )}
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
          </div>
        </div>
      )}

      {!visible.length ? (
        <div className="panel empty">
          <h2>{rows.length ? "No alerts match these filters" : "Nothing here"}</h2>
          <p>{rows.length ? "Clear a filter or pick a saved view." : (emptyHint ?? "No alerts in this view.")}</p>
          {rows.length > 0 && (
            <button type="button" className="btn btn-outline btn-small" style={{ marginTop: 12 }} onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <form ref={formRef} action={action} onSubmit={(e) => (e.preventDefault(), submitBatch())}>
          <div className={`panel table-wrap ${WB_ONLY_WIDE}`}>
            <table className="table queue-table">
              <caption className="visually-hidden">Alert queue. Press J and K to move, Enter to open{selectable ? ", X to select for batch close" : ""}.</caption>
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
                  {members && <th>Owner</th>}
                  {showStatus && <th>Status</th>}
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {visible.map((r, i) => {
                  const hidden = isHidden(r);
                  const canSelect = eligible.includes(r.id);
                  const slaDays = daysLeft(new Date(r.slaDueAt));
                  return (
                    <tr key={r.id} className={i === cursor ? "is-cursor" : undefined} onMouseEnter={() => setCursor(i)}>
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
                        <Link className="row-link num" href={alertHref(r.id)} onClick={onOpen ? (e) => (e.preventDefault(), onOpen(r.id)) : undefined}>
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
                          <span className={`rec rec-${r.recommendation}`}>{r.outcome === "locked" ? "Locked to human" : r.outcome === "abstained" ? "Abstained" : REC_LABEL[r.recommendation]}</span>
                        ) : (
                          <span className="rec rec-hidden">Not triaged</span>
                        )}
                        {!hidden && r.modelRecommendation && r.modelRecommendation !== r.recommendation && <span className="cell-sub">Model said {r.modelRecommendation}; policy changed it</span>}
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
                      <td className="num nowrap">
                        <Time value={r.createdAt} format="relative" />
                        {OPEN_STATUSES.includes(r.status) && <span className={`cell-sub ${slaDays <= 3 ? "sla-late" : ""}`}>{slaDays >= 0 ? `${slaDays} d to SLA` : `${-slaDays} d past SLA`}</span>}
                      </td>
                      {members && <td className="owner">{r.assigneeId && r.assigneeId === currentUserId ? "You" : (r.assigneeName ?? <span className="cell-sub">Unassigned</span>)}</td>}
                      {showStatus && <td>{STATUS_LABEL[r.status]}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={WB_ONLY_NARROW}>
            <QueueCards
              rows={visible.map((r) => ({ ...r, batchEligible: !!r.batchEligible, hidden: isHidden(r) }))}
              onOpen={open}
              hrefFor={alertHref}
              selectable={selectable}
              selected={selected}
              onToggle={toggle}
              currentId={visible[cursor]?.id ?? null}
            />
          </div>
          {selectable && selected.size > 0 && <BatchBar count={selected.size} onApprove={submitBatch} onClear={() => setSelected(new Set())} sampleSize={sampleSize} pending={pending} />}
        </form>
      )}
    </div>
  );
}
