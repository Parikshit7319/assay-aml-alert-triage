"use client";

import { useState } from "react";

export interface NsPoint {
  weekStart: string;
  mode: "manual" | "shadow" | "assisted";
  value: number | null;
  alerts: number;
  sars: number;
  hours: number;
}

const W = 720;
const H = 260;
const PAD = { top: 30, right: 16, bottom: 34, left: 40 };
const MODE_LABEL = { manual: "Manual", shadow: "Shadow mode", assisted: "Agent-assisted" };

/** Single series, so no legend box: the panel title names it. Phases are labelled bands, not colours. */
export function NorthStarChart({ points, baseline }: { points: NsPoint[]; baseline: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(10, ...points.map((p) => p.value ?? 0), baseline ?? 0) * 1.12;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const band = iw / points.length;
  const bw = Math.min(42, band - 2);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 10, 20, 30, 40, 50].filter((t) => t <= max);

  const phases: { mode: NsPoint["mode"]; from: number; to: number }[] = [];
  points.forEach((p, i) => {
    const last = phases[phases.length - 1];
    if (last && last.mode === p.mode) last.to = i;
    else phases.push({ mode: p.mode, from: i, to: i });
  });

  const h = hover != null ? points[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Analyst hours per confirmed suspicious case, by week">
        {phases.map((ph, i) => (
          <g key={i}>
            {ph.mode !== "manual" && (
              <rect x={PAD.left + ph.from * band} y={PAD.top - 22} width={(ph.to - ph.from + 1) * band} height={ih + 22} fill={ph.mode === "assisted" ? "#e9eef7" : "#f1f3f0"} />
            )}
            <text x={PAD.left + ph.from * band + 6} y={PAD.top - 8} style={{ fontWeight: 600, fill: "var(--ink-2)" }}>
              {MODE_LABEL[ph.mode]}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#dfe5ec" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {baseline != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(baseline)} y2={y(baseline)} stroke="var(--ink-2)" strokeDasharray="4 4" strokeWidth={1.5} />
            <text x={W - PAD.right} y={y(baseline) - 6} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              Manual baseline {baseline.toFixed(1)} h
            </text>
          </g>
        )}
        {points.map((p, i) => {
          if (p.value == null) return null;
          const x = PAD.left + i * band + (band - bw) / 2;
          const top = y(p.value);
          const hgt = PAD.top + ih - top;
          const r = Math.min(4, hgt / 2);
          return (
            <g key={p.weekStart}>
              <path
                d={`M${x},${PAD.top + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.top + ih} Z`}
                fill="var(--blue)"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`Week of ${p.weekStart}: ${p.value.toFixed(1)} hours per confirmed case`}
              />
              <text x={PAD.left + i * band + band / 2} y={H - PAD.bottom + 16} textAnchor="middle">
                {new Date(p.weekStart + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </text>
            </g>
          );
        })}
        {[0, points.length - 1].map((i) =>
          points[i]?.value != null ? (
            <text key={i} x={PAD.left + i * band + band / 2} y={y(points[i].value!) - 6} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 650 }}>
              {points[i].value!.toFixed(1)}
            </text>
          ) : null,
        )}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="var(--rule-strong)" />
      </svg>
      {h && h.value != null && (
        <div
          role="status"
          style={{
            position: "absolute",
            left: `${((PAD.left + hover! * band + band / 2) / W) * 100}%`,
            top: 4,
            transform: "translateX(-50%)",
            padding: "6px 10px",
            background: "var(--white)",
            border: "1px solid var(--rule-strong)",
            borderRadius: 4,
            fontSize: 12.5,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 4px 12px -6px rgba(0,0,0,.25)",
          }}
        >
          <b>{h.value.toFixed(1)} h</b> per confirmed case
          <br />
          {Math.round(h.hours).toLocaleString()} analyst hours, {h.sars} SARs, {h.alerts.toLocaleString()} alerts
        </div>
      )}
    </div>
  );
}
