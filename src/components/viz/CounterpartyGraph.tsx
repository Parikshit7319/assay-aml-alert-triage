"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import "./viz.css";
import {
  aggregateCounterparties,
  formatUsd,
  initials,
  radialLayout,
  radialSpec,
  truncate,
  type CounterpartyNode,
  type VizTxnWithCountry,
} from "./helpers";

export interface CounterpartyGraphProps {
  customerName: string;
  transactions: VizTxnWithCountry[];
  highRiskCountries: string[];
  highlightedIds: string[];
  onSelect?: (txnIds: string[]) => void;
  /** Shows a collapsible table twin under the chart. Defaults to true. */
  showTable?: boolean;
}

const W = 720;
const PAD_Y = 40;
const CUSTOMER_R = 24;
const R_MIN = 5;
const R_MAX = 22;
const BOW = 14;

/** Rendered width of a container, used to keep label text legible when the SVG scales down. */
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

type Placed = { node: CounterpartyNode; x: number; y: number; side: "left" | "right"; r: number };

/**
 * Who the customer pays and who pays the customer. Senders sit on the left arc,
 * receivers on the right, each ordered by volume from the top. Circle area tracks
 * total volume; line weight tracks transaction count.
 */
export function CounterpartyGraph({
  customerName,
  transactions,
  highRiskCountries,
  highlightedIds,
  onSelect,
  showTable = true,
}: CounterpartyGraphProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<string | null>(null);

  const nodes = useMemo(
    () => aggregateCounterparties(transactions, { highRiskCountries, highlightedIds, maxNodes: 18 }),
    [transactions, highRiskCountries, highlightedIds],
  );

  const [measure, cw] = useContainerWidth(W);
  // On narrow screens the whole SVG scales down; grow text in viewBox units so it lands near 10.5px,
  // pull the ring in, and shorten labels to fit the room that is left.
  const k = Math.min(1.9, Math.max(1, 630 / cw));
  const RX = cw < 560 ? 165 : 215;
  const labelChars = Math.max(8, Math.min(18, Math.floor((W / 2 - RX - 16) / (6.6 * k))));
  const spec = useMemo(() => radialSpec(nodes, { minGap: 30 * k }), [nodes, k]);
  const H = Math.round(1.6 * spec.ry + PAD_Y * 2);
  const C = { x: W / 2, y: H / 2 };

  const placed: Placed[] = useMemo(() => {
    const maxTotal = Math.max(1, ...nodes.map((n) => n.totalCents));
    // Largest circle never wider than the row gap on the busier side.
    const rMax = Math.max(R_MIN + 3, Math.min(R_MAX, spec.gap / 2 - 3));
    return radialLayout(nodes, { x: W / 2, y: H / 2 }, { x: RX, y: spec.ry }).map((p) => ({
      node: p.node,
      x: p.x,
      y: p.y,
      side: p.side,
      r: R_MIN + (rMax - R_MIN) * Math.sqrt(p.node.totalCents / maxTotal),
    }));
  }, [nodes, spec, H, RX]);

  if (placed.length === 0) {
    return (
      <div className="viz viz-empty" role="note">
        No counterparty activity to map for {customerName}.
      </div>
    );
  }

  const maxCount = Math.max(1, ...nodes.flatMap((n) => [n.inCount, n.outCount]));
  const weight = (count: number) => 1 + 3.25 * Math.sqrt(count / maxCount);
  const hasRisk = nodes.some((n) => n.highRisk);
  const hasLit = nodes.some((n) => n.highlighted);
  const active = hover ? placed.find((p) => p.node.key === hover) ?? null : null;

  /** Quadratic edge between two circles, bowed sideways so an in edge and an out edge never sit on top of each other. */
  const edge = (from: { x: number; y: number; r: number }, to: { x: number; y: number; r: number }, bow: number) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = from.x + ux * from.r;
    const sy = from.y + uy * from.r;
    const ex = to.x - ux * (to.r + 1.5);
    const ey = to.y - uy * (to.r + 1.5);
    const mx = (sx + ex) / 2 - uy * bow;
    const my = (sy + ey) / 2 + ux * bow;
    return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  };

  const select = (n: CounterpartyNode) => onSelect?.(n.txnIds);
  const onKey = (e: KeyboardEvent<SVGGElement>, n: CounterpartyNode) => {
    if ((e.key === "Enter" || e.key === " ") && onSelect) {
      e.preventDefault();
      select(n);
    }
  };

  const describe = (n: CounterpartyNode) => {
    const parts = [n.label];
    if (n.country) parts.push(n.highRisk ? `${n.country}, high-risk jurisdiction` : n.country);
    if (n.inCount) parts.push(`sent the customer ${formatUsd(n.inCents)} in ${n.inCount} ${n.inCount === 1 ? "transaction" : "transactions"}`);
    if (n.outCount) parts.push(`received ${formatUsd(n.outCents)} in ${n.outCount} ${n.outCount === 1 ? "transaction" : "transactions"}`);
    if (n.highlighted) parts.push("highlighted");
    return parts.join(", ");
  };

  const centre = { x: C.x, y: C.y, r: CUSTOMER_R };
  const inMarker = `viz-arrow-in-${uid}`;
  const outMarker = `viz-arrow-out-${uid}`;

  const tipStyle = active
    ? (() => {
        const fx = active.x / W;
        const fy = active.y / H;
        const shiftX = fx > 0.7 ? "-100%" : fx < 0.3 ? "0%" : "-50%";
        const below = fy < 0.35;
        return {
          left: `calc(${fx * 100}% + ${fx > 0.7 ? -(active.r + 6) : fx < 0.3 ? active.r + 6 : 0}px)`,
          top: `${fy * 100}%`,
          transform: `translate(${shiftX}, ${below ? `${active.r + 8}px` : `calc(-100% - ${active.r + 8}px)`})`,
        };
      })()
    : undefined;

  return (
    <div className="viz viz-graph">
      <div className="viz-legend" aria-hidden="true">
        <span className="viz-legend__item">
          <svg width="22" height="10" viewBox="0 0 22 10">
            <line x1="1" y1="5" x2="15" y2="5" stroke="var(--ink-2)" strokeWidth="1.75" />
            <path d="M14,1.5 L20,5 L14,8.5 Z" fill="var(--ink-2)" />
          </svg>
          Money in to the customer
        </span>
        <span className="viz-legend__item">
          <svg width="22" height="10" viewBox="0 0 22 10">
            <line x1="1" y1="5" x2="15" y2="5" stroke="var(--blue)" strokeWidth="1.75" />
            <path d="M14,1.5 L20,5 L14,8.5 Z" fill="var(--blue)" />
          </svg>
          Money out from the customer
        </span>
        {hasRisk && (
          <span className="viz-legend__item">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--red)" strokeWidth="2" />
              <circle cx="8" cy="8" r="3.5" fill="var(--sheet)" stroke="var(--ink-2)" strokeWidth="1.25" />
            </svg>
            High-risk country
          </span>
        )}
        {hasLit && (
          <span className="viz-legend__item">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7.5" fill="var(--highlight-solid)" />
              <circle cx="8" cy="8" r="4" fill="var(--sheet)" stroke="var(--ink-2)" strokeWidth="1.25" />
            </svg>
            Highlighted
          </span>
        )}
        <span className="viz-legend__note">Circle size is total volume. Line weight is transaction count.</span>
      </div>

      <div className="viz-plot" ref={measure}>
        <svg
          className="viz-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          style={{ ["--viz-k" as string]: k } as CSSProperties}
          aria-label={`Counterparty network for ${customerName}: ${nodes.length} ${nodes.length === 1 ? "counterparty" : "counterparties"}. Senders on the left, receivers on the right.`}
        >
          <defs>
            <marker id={inMarker} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0.5 L8,4 L0,7.5 Z" fill="var(--ink-2)" />
            </marker>
            <marker id={outMarker} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0.5 L8,4 L0,7.5 Z" fill="var(--blue)" />
            </marker>
          </defs>

          {/* edges first, under every node */}
          {placed.map((p) => {
            const n = p.node;
            const both = n.inCount > 0 && n.outCount > 0;
            const dim = hover != null && hover !== n.key;
            const op = hover == null ? 0.7 : dim ? 0.14 : 1;
            return (
              <g key={`e-${n.key}`} opacity={op} className="viz-edge">
                {n.inCount > 0 && (
                  <path d={edge(p, centre, both ? BOW : 0)} stroke="var(--ink-2)" strokeWidth={weight(n.inCount)} fill="none" markerEnd={`url(#${inMarker})`} />
                )}
                {n.outCount > 0 && (
                  <path d={edge(centre, p, both ? BOW : 0)} stroke="var(--blue)" strokeWidth={weight(n.outCount)} fill="none" markerEnd={`url(#${outMarker})`} />
                )}
              </g>
            );
          })}

          {/* customer */}
          <g className="viz-customer">
            <circle cx={C.x} cy={C.y} r={CUSTOMER_R + 3} fill="var(--sheet)" />
            <circle cx={C.x} cy={C.y} r={CUSTOMER_R} fill="var(--ink)" />
            <text x={C.x} y={C.y + 4.5} textAnchor="middle" className="viz-customer__initials">
              {initials(customerName)}
            </text>
            <text x={C.x} y={C.y + CUSTOMER_R + 6 + 11 * k} textAnchor="middle" className="viz-node-label viz-node-label--strong">
              {truncate(customerName, 26)}
            </text>
          </g>

          {placed.map((p) => {
            const n = p.node;
            const on = hover === n.key;
            const dim = hover != null && !on;
            const anchor = p.side === "left" ? "end" : "start";
            const lx = p.x + (p.side === "left" ? -1 : 1) * (p.r + (n.highRisk ? 9 : 6));
            const ly = p.y + (n.highRisk ? -2.5 * k : 4 * k);
            return (
              <g
                key={n.key}
                className="viz-node"
                role="button"
                tabIndex={0}
                aria-label={describe(n)}
                opacity={dim ? 0.45 : 1}
                onPointerEnter={() => setHover(n.key)}
                onPointerLeave={() => setHover((h) => (h === n.key ? null : h))}
                onFocus={() => setHover(n.key)}
                onBlur={() => setHover((h) => (h === n.key ? null : h))}
                onClick={() => select(n)}
                onKeyDown={(e) => onKey(e, n)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
              >
                {n.highlighted && <circle cx={p.x} cy={p.y} r={p.r + 6.5} fill="var(--highlight-solid)" />}
                {n.highRisk && <circle cx={p.x} cy={p.y} r={p.r + 3.5} fill="none" stroke="var(--red)" strokeWidth={2} />}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={n.folded ? "var(--paper-deep, #e6ebe3)" : "var(--sheet)"}
                  stroke={on ? "var(--ink)" : "var(--ink-2)"}
                  strokeWidth={on ? 2.25 : 1.5}
                />
                <circle cx={p.x} cy={p.y} r={Math.max(p.r + 8, 14)} fill="transparent" />
                <text x={lx} y={ly} textAnchor={anchor} className="viz-node-label">
                  {truncate(n.label, labelChars)}
                </text>
                {n.highRisk && n.country && (
                  <text x={lx} y={ly + 13 * k} textAnchor={anchor} className="viz-node-label viz-node-label--risk">
                    {n.country}, high-risk
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {active && (
          <div className="viz-tip" style={tipStyle} role="status" aria-live="polite">
            <div className="viz-tip__head">{active.node.label}</div>
            {active.node.inCount > 0 && (
              <div className="viz-tip__value">
                {formatUsd(active.node.inCents)} <span>in, {active.node.inCount} {active.node.inCount === 1 ? "transaction" : "transactions"}</span>
              </div>
            )}
            {active.node.outCount > 0 && (
              <div className="viz-tip__value">
                {formatUsd(active.node.outCents)} <span>out, {active.node.outCount} {active.node.outCount === 1 ? "transaction" : "transactions"}</span>
              </div>
            )}
            <div className="viz-tip__row">
              {active.node.folded
                ? `Folds ${active.node.folded} smaller counterparties`
                : active.node.country
                  ? `Country: ${active.node.country}${active.node.highRisk ? ", high-risk jurisdiction" : ""}`
                  : "Country: not recorded"}
            </div>
            {active.node.highRisk && <div className="viz-tip__flag viz-tip__flag--risk">High-risk country</div>}
            {active.node.highlighted && <div className="viz-tip__flag">Highlighted</div>}
          </div>
        )}
      </div>

      {showTable && (
        <details className="viz-table">
          <summary>View as table ({nodes.length} {nodes.length === 1 ? "counterparty" : "counterparties"})</summary>
          <div className="viz-table__scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Counterparty</th>
                  <th scope="col">Country</th>
                  <th scope="col" className="viz-num">
                    In
                  </th>
                  <th scope="col" className="viz-num">
                    Out
                  </th>
                  <th scope="col" className="viz-num">
                    Transactions
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.key} className={n.highRisk ? "is-risk" : undefined}>
                    <td>
                      {onSelect ? (
                        <button type="button" className="viz-linkbtn" onClick={() => select(n)}>
                          {n.label}
                        </button>
                      ) : (
                        n.label
                      )}
                    </td>
                    <td>{n.country ? `${n.country}${n.highRisk ? ", high-risk" : ""}` : ""}</td>
                    <td className="viz-num">{n.inCount ? formatUsd(n.inCents) : ""}</td>
                    <td className="viz-num">{n.outCount ? formatUsd(n.outCents) : ""}</td>
                    <td className="viz-num">{n.count}</td>
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
