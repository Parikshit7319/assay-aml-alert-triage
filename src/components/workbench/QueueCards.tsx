"use client";

import { Icon, TYPOLOGY_ICON } from "@/components/viz/Icon";
import type { Typology } from "@/lib/db/schema";
import { REC_LABEL, STATUS_LABEL, TYPOLOGY_LABEL } from "@/lib/labels";
import { daysSince, daysUntil } from "./time-format";
import "./workbench.css";

/** Add to the queue table wrapper: hidden at 760px and below. */
export const WB_ONLY_WIDE = "wb-only-wide";
/** Add to the QueueCards wrapper: shown only at 760px and below. */
export const WB_ONLY_NARROW = "wb-only-narrow";

export interface QueueCardRow {
  id: string;
  customerName: string;
  customerKind?: string;
  ruleCode?: string;
  typology: string;
  status: string;
  recommendation: string | null;
  /** Run outcome: "completed", "locked" or "abstained". Changes the recommendation wording. */
  outcome?: string | null;
  riskScore: number | null;
  confidence: number | null;
  createdAt: string | Date;
  slaDueAt: string | Date;
  assigneeName?: string | null;
  /** True when the agent's view is hidden because the alert type is in shadow mode. */
  hidden?: boolean;
  batchEligible?: boolean;
}

export interface QueueCardsProps<T extends QueueCardRow> {
  rows: T[];
  onOpen: (id: string) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  /** Real link target for each card (keeps open-in-new-tab working). Clicks still call onOpen. */
  hrefFor?: (id: string) => string;
  /** Which rows may be ticked for batch close. Defaults to batch-eligible, ready-for-review rows not in shadow mode. */
  canSelect?: (row: T) => boolean;
  /** The id of the alert the J and K shortcuts point at, outlined. */
  currentId?: string | null;
}

const OPEN_STATUSES = new Set(["new", "triaged", "locked"]);

export function recWords(r: Pick<QueueCardRow, "recommendation" | "outcome" | "hidden">): { cls: string; text: string } {
  if (r.hidden) return { cls: "rec-hidden", text: "Hidden in shadow mode" };
  if (!r.recommendation) return { cls: "rec-hidden", text: "Not triaged" };
  // Locked and abstained runs always land with an analyst, so they wear the review color.
  if (r.outcome === "locked") return { cls: "rec-human_review", text: "Locked to human" };
  if (r.outcome === "abstained") return { cls: "rec-human_review", text: "Agent abstained" };
  return { cls: `rec-${r.recommendation}`, text: REC_LABEL[r.recommendation as keyof typeof REC_LABEL] ?? r.recommendation };
}

const defaultCanSelect = (r: QueueCardRow) => !!r.batchEligible && r.status === "triaged" && !r.hidden;

/**
 * The queue as cards for narrow screens: customer, type, the agent's
 * recommendation in words, risk, confidence, age, SLA and assignee. Each card
 * is one large tap target that opens the alert.
 */
export function QueueCards<T extends QueueCardRow>({ rows, onOpen, selectable = false, selected, onToggle, hrefFor, canSelect = defaultCanSelect, currentId }: QueueCardsProps<T>) {
  if (!rows.length) {
    return (
      <div className="panel empty">
        <h2>Nothing here</h2>
        <p>No alerts match this view.</p>
      </div>
    );
  }
  return (
    <ul className="wb-cards" aria-label="Alerts">
      {rows.map((r) => {
        const rec = recWords(r);
        const open = OPEN_STATUSES.has(r.status);
        const sla = daysUntil(r.slaDueAt);
        const age = daysSince(r.createdAt);
        const can = selectable && canSelect(r);
        const checked = !!selected?.has(r.id);
        const typ = r.typology as Typology;
        return (
          <li key={r.id} className={`wb-card ${checked ? "is-selected" : ""} ${currentId === r.id ? "is-current" : ""}`} data-alert-id={r.id}>
            <div className="wb-card__top">
              {selectable && (
                <input
                  type="checkbox"
                  className="wb-card__check"
                  aria-label={`Select ${r.id}, ${r.customerName}, for batch close`}
                  disabled={!can}
                  checked={checked}
                  onChange={() => onToggle?.(r.id)}
                  title={can ? "Eligible for batch close" : "Not eligible for batch close"}
                />
              )}
              <div className="wb-card__who">
                {hrefFor ? (
                  <a
                    className="wb-card__open"
                    href={hrefFor(r.id)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      onOpen(r.id);
                    }}
                  >
                    {r.customerName}
                  </a>
                ) : (
                  <button type="button" className="wb-card__open" onClick={() => onOpen(r.id)}>
                    {r.customerName}
                  </button>
                )}
                <span className="wb-card__sub">
                  <span className="num">{r.id}</span>
                  {r.customerKind ? `, ${r.customerKind}` : ""}
                </span>
              </div>
              <span className="wb-card__risk" title="Agent risk score, 0 to 100">
                <small>Risk</small>
                <b className="num">{r.hidden || r.riskScore == null ? "n/a" : r.riskScore}</b>
              </span>
            </div>
            <div className="wb-card__mid">
              <span className="wb-card__type">
                <Icon name={TYPOLOGY_ICON[typ] ?? "other"} size={16} />
                {TYPOLOGY_LABEL[typ] ?? r.typology}
              </span>
              <span className={`rec ${rec.cls}`}>{rec.text}</span>
              {!r.hidden && r.confidence != null && r.outcome !== "locked" && r.outcome !== "abstained" && <span className="wb-card__conf num">{Math.round(r.confidence * 100)}% confidence</span>}
            </div>
            <dl className="wb-card__facts">
              <div>
                <dt>Age</dt>
                <dd className="num">{age < 1 ? "Today" : `${age} d`}</dd>
              </div>
              <div>
                <dt>{open ? "SLA" : "Status"}</dt>
                <dd className={`num ${open && sla <= 3 ? "sla-late" : ""}`}>{open ? (sla >= 0 ? `${sla} d left` : `${-sla} d late`) : (STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status)}</dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>{r.assigneeName ?? "Unassigned"}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export interface BatchBarProps {
  count: number;
  onApprove: () => void;
  onClear: () => void;
  /** How many of the selected alerts will be drawn for QA. */
  sampleSize: number;
  pending?: boolean;
}

/**
 * Sticky bar for batch approval, shown once at least one alert is selected.
 * Sticks to the bottom of the content column on desktop and spans the screen
 * on phones. Selection changes are announced politely.
 */
export function BatchBar({ count, onApprove, onClear, sampleSize, pending = false }: BatchBarProps) {
  const label = `Approve ${count} close${count === 1 ? "" : "s"}`;
  return (
    <div className="wb-batchbar-wrap">
      <p className="visually-hidden" aria-live="polite">
        {count > 0 ? `${count} selected for batch close. ${sampleSize} will be drawn for QA.` : ""}
      </p>
      {count > 0 && (
        <div className="wb-batchbar" role="region" aria-label="Batch approval">
          <p className="wb-batchbar__text">
            <b className="num">{count}</b> selected. <span className="num">{sampleSize}</span> will be drawn for QA review.
          </p>
          <div className="wb-batchbar__actions">
            <button type="button" className="btn btn-quiet btn-small" onClick={onClear} disabled={pending}>
              Clear
            </button>
            <button type="button" className="btn btn-close btn-small" onClick={onApprove} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Closing" : label}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
