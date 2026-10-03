"use client";

import { useId, useState } from "react";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface Field {
  key: "alerts" | "minutes" | "cost" | "saved";
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: Field[] = [
  { key: "alerts", label: "Alerts per month", hint: "Transaction-monitoring alerts reaching L1", min: 200, max: 40000, step: 100 },
  { key: "minutes", label: "Minutes per L1 review", hint: "Industry estimates run 20 to 60", min: 5, max: 90, step: 1 },
  { key: "cost", label: "Loaded cost per analyst", hint: "Salary plus benefits, per year", min: 40000, max: 200000, step: 5000 },
  { key: "saved", label: "L1 time saved", hint: "Modeled: half the time on closes, a fifth on escalations", min: 0, max: 80, step: 1 },
];

const PRODUCTIVE_HOURS = 1560;

export function RoiCalculator() {
  const id = useId();
  const [v, setV] = useState({ alerts: 4000, minutes: 30, cost: 90000, saved: 45 });
  const hoursPerMonth = (v.alerts * v.minutes) / 60;
  const rate = v.cost / PRODUCTIVE_HOURS;
  const analysts = (hoursPerMonth * 12) / PRODUCTIVE_HOURS;
  const annualLabor = hoursPerMonth * 12 * rate;
  const savedHours = hoursPerMonth * (v.saved / 100);
  const freed = savedHours * 12 * rate;
  const assay = (1500 + Math.max(0, v.alerts - 2000) * 0.6) * 12;

  return (
    <div className="roi">
      <div className="roi__inputs">
        {FIELDS.map((f) => (
          <label key={f.key} className="roi__field" htmlFor={`${id}-${f.key}`}>
            <span className="roi__label">
              {f.label}
              <output className="num">{f.key === "cost" ? money(v.cost) : f.key === "saved" ? `${v.saved}%` : fmt(v[f.key])}</output>
            </span>
            <input
              id={`${id}-${f.key}`}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={v[f.key]}
              onChange={(e) => setV((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
            />
            <small>{f.hint}</small>
          </label>
        ))}
      </div>
      <dl className="roi__out">
        <div>
          <dt>L1 review today</dt>
          <dd className="num">
            {fmt(hoursPerMonth)} hours a month, about {analysts.toFixed(1)} analysts, {money(annualLabor)} a year
          </dd>
        </div>
        <div>
          <dt>Analyst time freed</dt>
          <dd className="num">
            {fmt(savedHours)} hours a month, worth {money(freed)} a year
          </dd>
        </div>
        <div>
          <dt>Assay on the Team plan</dt>
          <dd className="num">{money(assay)} a year</dd>
        </div>
        <div className="roi__net">
          <dt>Net</dt>
          <dd className="num">
            {money(freed - assay)} a year{assay > 0 && freed > 0 ? `, ${(freed / assay).toFixed(1)}x the cost` : ""}
          </dd>
        </div>
      </dl>
      <p className="roi__note">
        Modeled estimate at {fmt(PRODUCTIVE_HOURS)} productive hours per analyst per year. Time saved is an assumption until a pilot measures it on your alerts. Freed time is capacity, not a headcount cut.
      </p>
    </div>
  );
}
