"use client";

import { useId } from "react";
import { Icon } from "@/components/viz/Icon";
import { OVERLOAD_FACTOR, summarizeWorkload, type WorkloadRow } from "./workload";
import "./workbench.css";

export type { WorkloadRow } from "./workload";

export interface AssigneeMember {
  id: string;
  name: string;
  role?: string;
}

export interface AssigneeSelectProps {
  members: AssigneeMember[];
  value: string | null;
  onChange: (id: string | null) => void;
  currentUserId?: string;
  /** Smaller control for table rows and cards; the label is visually hidden. */
  compact?: boolean;
  disabled?: boolean;
  /** Visible or screen-reader label. Defaults to "Assignee". */
  label?: string;
}

/**
 * Assignee picker: a native select with "Unassigned" plus every member, and
 * an "Assign to me" shortcut when the alert is not already yours.
 */
export function AssigneeSelect({ members, value, onChange, currentUserId, compact = false, disabled = false, label = "Assignee" }: AssigneeSelectProps) {
  const id = useId();
  const known = value == null || members.some((m) => m.id === value);
  const canTakeIt = !!currentUserId && value !== currentUserId && members.some((m) => m.id === currentUserId);
  return (
    <div className={`wb-assignee ${compact ? "wb-assignee--compact" : ""}`}>
      <label htmlFor={id} className={compact ? "visually-hidden" : "wb-assignee__label"}>
        {label}
      </label>
      <div className="wb-assignee__row">
        <select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.id === currentUserId ? " (you)" : ""}
              {m.role && !compact ? `, ${m.role}` : ""}
            </option>
          ))}
          {!known && <option value={value!}>Former member</option>}
        </select>
        {canTakeIt && (
          <button type="button" className="btn btn-quiet btn-small wb-assignee__me" disabled={disabled} onClick={() => onChange(currentUserId!)}>
            {compact ? "Me" : "Assign to me"}
            {compact && <span className="visually-hidden">: assign to me</span>}
          </button>
        )}
      </div>
    </div>
  );
}

export interface TeamWorkloadProps {
  rows: WorkloadRow[];
  unassigned: number;
  /** Called with a user id (or null for unassigned) to filter the queue to that person. */
  onSelect?: (userId: string | null) => void;
  /** Internal review SLA in days; an oldest open alert at or past it is marked. Defaults to 30. */
  slaDays?: number;
}

function LoadBar({ value, max, over }: { value: number; max: number; over: boolean }) {
  return (
    <span className={`wb-load ${over ? "wb-load--over" : ""}`} aria-hidden="true">
      <i style={{ width: `${Math.round((value / Math.max(1, max)) * 100)}%` }} />
    </span>
  );
}

/**
 * Who holds how much: open alerts with an inline bar, L2 cases, decisions in
 * the last 7 days and the oldest open alert. Anyone above 1.5x the team's
 * median open load is flagged in words and color.
 */
export function TeamWorkload({ rows, unassigned, onSelect, slaDays = 30 }: TeamWorkloadProps) {
  const hid = useId();
  const s = summarizeWorkload(rows, OVERLOAD_FACTOR, unassigned);
  const name = (label: string, userId: string | null) =>
    onSelect ? (
      <button type="button" className="wb-linkbtn" onClick={() => onSelect(userId)}>
        {label}
        <span className="visually-hidden">: show this queue</span>
      </button>
    ) : (
      label
    );
  return (
    <section className="panel" aria-labelledby={hid}>
      <div className="panel__head">
        <h2 id={hid}>Team workload</h2>
        <span className="num">
          {s.totalOpen} open, median {Number.isInteger(s.median) ? s.median : s.median.toFixed(1)} per analyst
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>No analysts in this workspace yet. Invite teammates to share the queue.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table wb-workload">
            <thead>
              <tr>
                <th>Analyst</th>
                <th>Open alerts</th>
                <th className="r">L2 cases</th>
                <th className="r">Decided, last 7 days</th>
                <th className="r">Oldest open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const over = s.overloaded.has(r.userId);
                return (
                  <tr key={r.userId}>
                    <td>
                      {name(r.name, r.userId)}
                      <span className="cell-sub">{r.role}</span>
                    </td>
                    <td>
                      <span className="wb-load-cell">
                        <LoadBar value={r.open} max={s.max} over={over} />
                        <span className="num">{r.open}</span>
                        {over && (
                          <span className="wb-flag">
                            <Icon name="escalate" size={14} /> Over {OVERLOAD_FACTOR}x median
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="r num">{r.l2}</td>
                    <td className="r num">{r.decidedLast7d}</td>
                    <td className={`r num ${r.oldestOpenDays != null && r.oldestOpenDays >= slaDays ? "sla-late" : ""}`}>
                      {r.oldestOpenDays == null ? "None open" : `${r.oldestOpenDays} d${r.oldestOpenDays >= slaDays ? ", past SLA" : ""}`}
                    </td>
                  </tr>
                );
              })}
              <tr className="wb-workload__unassigned">
                <td>{name("Unassigned", null)}</td>
                <td>
                  <span className="wb-load-cell">
                    <LoadBar value={unassigned} max={s.max} over={false} />
                    <span className="num">{unassigned}</span>
                  </span>
                </td>
                <td className="r num" />
                <td className="r num" />
                <td className="r num" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="wb-foot-note">
        Bars are relative to the largest open load. A flag means more than {OVERLOAD_FACTOR} times the team median ({s.threshold % 1 ? s.threshold.toFixed(1) : s.threshold} open), with at least 3 open.
      </p>
    </section>
  );
}
