"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import "./viz.css";
import {
  amountAxis,
  CHANNEL_LABEL,
  channelAndParty,
  CTR_CENTS,
  formatCompactUsd,
  formatDate,
  formatDateTime,
  formatUsd,
  hasNearCtrCash,
  inWindow,
  monthTicks,
  partyLabel,
  sqrtScale,
  windowBefore,
  type VizTxn,
} from "./helpers";

export interface TransactionTimelineProps {
  transactions: VizTxn[];
  triggeredIds: string[];
  highlightedIds: string[];
  alertCreatedAt: string;
  onSelect?: (id: string) => void;
  height?: number;
  /** Shows a collapsible table twin under the chart. Defaults to true. */
  showTable?: boolean;
}

const W_DEFAULT = 720;
const PAD = { top: 14, right: 14, bottom: 26, left: 46 };
const HIT = 14;

/** Rendered width of a container, so one viewBox unit stays one CSS pixel and text never shrinks on phones. */
function useContainerWidth(fallback: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

interface Mark {
  t: VizTxn;
  x: number;
  y: number;
  triggered: boolean;
  highlighted: boolean;
}

/**
 * Ninety days of activity before the alert. Inflows rise above the centre line and
 * outflows hang below it on one shared square-root amount scale, so a run of cash
 * deposits just under $10,000 reads as a row of near-equal stems.
 */
export function TransactionTimeline({
  transactions,
  triggeredIds,
  highlightedIds,
  alertCreatedAt,
  onSelect,
  height = 240,
  showTable = true,
}: TransactionTimelineProps) {
  const H = Math.max(160, height);
  const [measure, cw] = useContainerWidth(W_DEFAULT);
  const W = Math.max(280, cw);
  const svgRef = useRef<SVGSVGElement>(null);
  const markRefs = useRef<(SVGGElement | null)[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const trig = useMemo(() => new Set(triggeredIds), [triggeredIds]);
  const lit = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const win = useMemo(() => windowBefore(alertCreatedAt, 90), [alertCreatedAt]);
  const txns = useMemo(() => inWindow(transactions, win), [transactions, win]);

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const y0 = PAD.top + ih / 2;
  const half = ih / 2 - 4;

  const showCtr = useMemo(() => hasNearCtrCash(txns), [txns]);
  const axis = useMemo(
    () => amountAxis(Math.max(0, ...txns.map((t) => Math.abs(t.amountCents))), { includeCtr: showCtr }),
    [txns, showCtr],
  );
  const scale = useMemo(() => sqrtScale(axis.domain, half), [axis.domain, half]);
  const xOf = (ms: number) => PAD.left + ((ms - win.startMs) / (win.endMs - win.startMs)) * iw;

  const marks: Mark[] = useMemo(
    () =>
      txns.map((t) => {
        const h = scale(Math.abs(t.amountCents));
        return {
          t,
          x: PAD.left + ((new Date(t.ts).getTime() - win.startMs) / (win.endMs - win.startMs)) * iw,
          y: t.direction === "in" ? y0 - h : y0 + h,
          triggered: trig.has(t.id),
          highlighted: lit.has(t.id),
        };
      }),
    [txns, scale, win, iw, y0, trig, lit],
  );

  // Roving tab stop: start on the first triggered transaction, else the most recent.
  const firstTriggered = marks.findIndex((m) => m.triggered);
  const tabStop = focusIdx ?? (firstTriggered >= 0 ? firstTriggered : marks.length - 1);
  const active = hover ?? focusIdx;
  const am = active != null ? marks[active] : null;

  if (marks.length === 0) {
    return (
      <div className="viz viz-empty" role="note">
        No transactions in the 90 days before this alert ({formatDate(win.startMs)} to {formatDate(win.endMs)}).
      </div>
    );
  }

  const toView = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  /** Nearest stem to the pointer, measured to the whole stem, not only its dot. */
  const nearest = (px: number, py: number): number | null => {
    let best: number | null = null;
    let bestD = HIT * HIT;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const dx = px - m.x;
      if (Math.abs(dx) > HIT) continue;
      const lo = Math.min(y0, m.y);
      const hi = Math.max(y0, m.y);
      const dy = py < lo ? lo - py : py > hi ? py - hi : 0;
      // Prefer the dot end when stems overlap on the same day.
      const tip = Math.abs(py - m.y) * 0.15;
      const d = dx * dx + dy * dy + tip;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const p = toView(e);
    setHover(nearest(p.x, p.y));
  };

  const moveFocus = (i: number) => {
    const n = Math.max(0, Math.min(marks.length - 1, i));
    setFocusIdx(n);
    markRefs.current[n]?.focus();
  };

  const onKey = (e: KeyboardEvent<SVGGElement>, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(0);
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(marks.length - 1);
    } else if ((e.key === "Enter" || e.key === " ") && onSelect) {
      e.preventDefault();
      onSelect(marks[i].t.id);
    }
  };

  const describe = (m: Mark) =>
    `${m.t.direction === "in" ? "Inflow" : "Outflow"} ${formatUsd(m.t.amountCents)}, ${formatDateTime(m.t.ts)}, ${channelAndParty(m.t)}${m.triggered ? ", triggered the rule" : ""}${m.highlighted ? ", highlighted" : ""}`;

  const ticks = monthTicks(win);
  const nTrig = marks.filter((m) => m.triggered).length;
  const ctrY = y0 - scale(CTR_CENTS);
  // Put the CTR label on whichever end of the guide has fewer marks crowding it.
  const LABEL_W = 140;
  const crowd = (x0: number, x1: number) => marks.filter((m) => m.x >= x0 && m.x <= x1 && m.y <= ctrY + 22).length;
  const ctrLeft = crowd(PAD.left, PAD.left + LABEL_W) < crowd(W - PAD.right - LABEL_W, W - PAD.right);

  // Tooltip placement: above inflow tips, below outflow tips, clamped at the edges.
  const tipStyle = am
    ? (() => {
        const fx = am.x / W;
        const shiftX = fx > 0.78 ? "-100%" : fx < 0.22 ? "0%" : "-50%";
        const below = am.y / H < 0.45;
        return {
          left: `calc(${fx * 100}% + ${fx > 0.78 ? -10 : fx < 0.22 ? 10 : 0}px)`,
          top: `${(am.y / H) * 100}%`,
          transform: `translate(${shiftX}, ${below ? "12px" : "calc(-100% - 12px)"})`,
        };
      })()
    : undefined;

  return (
    <div className="viz viz-timeline">
      <div className="viz-legend" aria-hidden="true">
        <span className="viz-legend__item">
          <svg width="14" height="16" viewBox="0 0 14 16">
            <line x1="7" y1="15" x2="7" y2="4" stroke="var(--ink-2)" strokeWidth="1.5" />
            <circle cx="7" cy="4" r="2.5" fill="var(--ink-2)" />
          </svg>
          Inflow, above the line
        </span>
        <span className="viz-legend__item">
          <svg width="14" height="16" viewBox="0 0 14 16">
            <line x1="7" y1="1" x2="7" y2="12" stroke="var(--blue)" strokeWidth="1.5" />
            <circle cx="7" cy="12" r="2.5" fill="var(--blue)" />
          </svg>
          Outflow, below the line
        </span>
        {nTrig > 0 && (
          <span className="viz-legend__item">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <line x1="8" y1="15" x2="8" y2="5" stroke="var(--highlight-solid)" strokeWidth="7" strokeLinecap="round" />
              <line x1="8" y1="15" x2="8" y2="5" stroke="var(--ink-2)" strokeWidth="2.5" />
              <circle cx="8" cy="5" r="3.5" fill="var(--ink-2)" />
            </svg>
            Triggered the rule
          </span>
        )}
        {lit.size > 0 && marks.some((m) => m.highlighted) && (
          <span className="viz-legend__item">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2.5" fill="var(--ink-2)" />
            </svg>
            Highlighted
          </span>
        )}
      </div>

      <div className="viz-plot" ref={measure}>
        <svg
          ref={svgRef}
          className="viz-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={`Transactions in the 90 days before the alert: ${marks.length} total, ${nTrig} triggered the rule. Use arrow keys to move between transactions.`}
        >
          {/* recessive grid: three ticks per side on one shared amount scale */}
          {axis.ticks.map((t) => {
            const d = scale(t);
            return (
              <g key={t} className="viz-grid">
                <line x1={PAD.left} x2={W - PAD.right} y1={y0 - d} y2={y0 - d} />
                <line x1={PAD.left} x2={W - PAD.right} y1={y0 + d} y2={y0 + d} />
                <text className="viz-tick" x={PAD.left - 8} y={y0 - d + 4} textAnchor="end">
                  {formatCompactUsd(t)}
                </text>
                <text className="viz-tick" x={PAD.left - 8} y={y0 + d + 4} textAnchor="end">
                  {formatCompactUsd(t)}
                </text>
              </g>
            );
          })}
          <text className="viz-axis-cap" x={PAD.left - 8} y={y0 - 4} textAnchor="end">
            In
          </text>
          <text className="viz-axis-cap" x={PAD.left - 8} y={y0 + 12} textAnchor="end">
            Out
          </text>

          {ticks.map((t) => {
            const x = xOf(t.ms);
            return (
              <g key={t.ms}>
                <line className="viz-month-rule" x1={x} x2={x} y1={PAD.top} y2={PAD.top + ih} />
                <text className="viz-tick" x={x} y={H - 8} textAnchor="middle">
                  {t.label}
                </text>
              </g>
            );
          })}

          {showCtr && (
            <g className="viz-ctr">
              <line x1={PAD.left} x2={W - PAD.right} y1={ctrY} y2={ctrY} />
              <text x={ctrLeft ? PAD.left + 4 : W - PAD.right - 2} y={ctrY - 5} textAnchor={ctrLeft ? "start" : "end"}>
                $10,000 CTR threshold
              </text>
            </g>
          )}

          <line className="viz-baseline" x1={PAD.left} x2={W - PAD.right} y1={y0} y2={y0} />

          {/* halos sit under every stem so a thin neighbour is never hidden */}
          {marks.map((m) =>
            m.triggered ? (
              <g key={`h-${m.t.id}`} className="viz-halo">
                <line x1={m.x} x2={m.x} y1={y0} y2={m.y} />
                <circle cx={m.x} cy={m.y} r={6.5} />
              </g>
            ) : null,
          )}

          {marks.map((m, i) => {
            const color = m.t.direction === "in" ? "var(--ink-2)" : "var(--blue)";
            const on = active === i;
            const dim = active != null && !on;
            return (
              <g
                key={m.t.id}
                ref={(el) => {
                  markRefs.current[i] = el;
                }}
                className="viz-mark"
                role="button"
                tabIndex={i === tabStop ? 0 : -1}
                aria-label={describe(m)}
                onFocus={() => setFocusIdx(i)}
                onBlur={() => setFocusIdx((f) => (f === i ? null : f))}
                onKeyDown={(e) => onKey(e, i)}
                opacity={dim ? 0.55 : 1}
              >
                <line
                  x1={m.x}
                  x2={m.x}
                  y1={y0}
                  y2={m.y}
                  stroke={color}
                  strokeWidth={m.triggered ? 2.25 : on ? 2 : 1.25}
                  strokeLinecap="butt"
                />
                <circle cx={m.x} cy={m.y} r={m.triggered ? 4 : 2.75} fill={color} stroke="var(--sheet)" strokeWidth={1.5} />
                {(m.highlighted || on) && (
                  <circle
                    cx={m.x}
                    cy={m.y}
                    r={m.triggered ? 9.5 : 7}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={on && !m.highlighted ? 1 : 1.5}
                  />
                )}
              </g>
            );
          })}

          {/* pointer layer: nearest-stem hit testing, so nobody has to land on a 1px line */}
          <rect
            className="viz-hit"
            x={PAD.left - HIT}
            y={PAD.top - HIT}
            width={iw + HIT * 2}
            height={ih + HIT * 2}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const p = toView(e);
              const i = nearest(p.x, p.y);
              setHover(i);
              if (i != null && onSelect) onSelect(marks[i].t.id);
            }}
            style={{ cursor: hover != null && onSelect ? "pointer" : "default" }}
          />
        </svg>

        {am && (
          <div className="viz-tip" style={tipStyle} role="status" aria-live="polite">
            <div className="viz-tip__value">
              {formatUsd(am.t.amountCents)} <span>{am.t.direction === "in" ? "in" : "out"}</span>
            </div>
            <div className="viz-tip__row">{formatDateTime(am.t.ts)}</div>
            <div className="viz-tip__row">
              {channelAndParty(am.t)}
            </div>
            {am.t.counterpartyName && am.t.branch && <div className="viz-tip__row viz-tip__muted">Branch: {am.t.branch}</div>}
            {am.triggered && <div className="viz-tip__flag">Triggered the rule</div>}
            {am.highlighted && !am.triggered && <div className="viz-tip__flag viz-tip__flag--ring">Highlighted</div>}
          </div>
        )}
      </div>

      {showTable && (
        <details className="viz-table">
          <summary>View as table ({marks.length} transactions)</summary>
          <div className="viz-table__scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Direction</th>
                  <th scope="col" className="viz-num">
                    Amount
                  </th>
                  <th scope="col">Channel</th>
                  <th scope="col">Counterparty or location</th>
                  <th scope="col">Flag</th>
                </tr>
              </thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.t.id} className={m.triggered ? "is-triggered" : undefined}>
                    <td>{formatDateTime(m.t.ts)}</td>
                    <td>{m.t.direction === "in" ? "In" : "Out"}</td>
                    <td className="viz-num">{formatUsd(m.t.amountCents)}</td>
                    <td>{CHANNEL_LABEL[m.t.channel]}</td>
                    <td>
                      {onSelect ? (
                        <button type="button" className="viz-linkbtn" onClick={() => onSelect(m.t.id)}>
                          {partyLabel(m.t)}
                        </button>
                      ) : (
                        partyLabel(m.t)
                      )}
                    </td>
                    <td>{[m.triggered ? "Triggered the rule" : "", m.highlighted ? "Highlighted" : ""].filter(Boolean).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
