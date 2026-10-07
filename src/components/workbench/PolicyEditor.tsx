"use client";

import { useId } from "react";
import { Icon } from "@/components/viz/Icon";
import type { AutonomyLevel, PolicySettings, Typology } from "@/lib/db/schema";
import { AUTONOMY_LEVELS, DEFAULT_POLICY, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import { clampField, diffPolicy, POLICY_FIELDS, policyWarnings, type PolicyField } from "./policy-diff";
import "./workbench.css";

export interface PolicyEditorProps {
  value: PolicySettings;
  onChange: (next: PolicySettings) => void;
  /** Re-triage every open alert with the current settings. */
  onRerun?: () => void;
  rerunning?: boolean;
  /** When set, every control is disabled and this note explains why (for example, "Only owners and admins can change policy."). */
  readOnlyNote?: string;
}

const L3_BAR = `at least ${L3_MIN_QA.toLocaleString("en-US")} QA-reviewed alerts at ${Math.round(L3_MIN_AGREEMENT * 100)}% agreement`;

function Slider({ f, value, onChange }: { f: PolicyField; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const def = DEFAULT_POLICY[f.key];
  const changed = Math.abs(def - value) > 1e-9;
  return (
    <div className="wb-slider">
      <div className="wb-slider__head">
        <label htmlFor={id}>{f.label}</label>
        <output htmlFor={id} className="num">
          {f.format(value)}
        </output>
        {changed && <span className="tag">Changed</span>}
      </div>
      <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={value} aria-valuetext={f.format(value)} aria-describedby={`${id}-what`} onChange={(e) => onChange(clampField(f, Number(e.target.value)))} />
      <div className="wb-slider__scale num" aria-hidden="true">
        <span>{f.format(f.min)}</span>
        <span>Default {f.format(def)}</span>
        <span>{f.format(f.max)}</span>
      </div>
      <p id={`${id}-what`} className="wb-slider__what">
        {f.what} <span>{f.effect}</span>
      </p>
    </div>
  );
}

function LevelControl({ typology, level, onPick }: { typology: Typology; level: AutonomyLevel; onPick: (l: AutonomyLevel) => void }) {
  const name = useId();
  return (
    <fieldset className="wb-seg">
      <legend className="visually-hidden">Autonomy level for {TYPOLOGY_LABEL[typology]}</legend>
      {AUTONOMY_LEVELS.map((l) => (
        <label key={l.level} className={`wb-seg__opt ${l.level === level ? "is-on" : ""} ${l.level === 3 ? "wb-seg__opt--l3" : ""}`}>
          <input type="radio" name={name} value={l.level} checked={l.level === level} onChange={() => onPick(l.level as AutonomyLevel)} />
          <span>
            <b>L{l.level}</b> {l.name}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Policy settings in plain language: the autonomy level per alert type, the
 * thresholds the engine applies before and after the model, what changes in
 * the queue when each one moves, a diff against the default policy, and the
 * decisions that are never automated.
 */
export function PolicyEditor({ value, onChange, onRerun, rerunning = false, readOnlyNote }: PolicyEditorProps) {
  const ids = useId();
  const readOnly = !!readOnlyNote;
  const changes = diffPolicy(value);
  const warnings = policyWarnings(value);
  const setLevel = (t: Typology, l: AutonomyLevel) => onChange({ ...value, autonomy: { ...value.autonomy, [t]: l } });
  const setField = (k: PolicyField["key"], v: number) => onChange({ ...value, [k]: v });

  return (
    <div className="wb-policy">
      {readOnlyNote && (
        <p className="note wb-policy__ro">
          <Icon name="lock" size={16} /> {readOnlyNote}
        </p>
      )}
      <fieldset className="wb-policy__fs" disabled={readOnly}>
        <section className="panel" aria-labelledby={`${ids}-auto`}>
          <div className="panel__head">
            <h2 id={`${ids}-auto`}>Autonomy by alert type</h2>
            <span>policy v{value.version}</span>
          </div>
          <div className="panel__body">
            <p className="wb-policy__lede">
              Each alert type earns autonomy separately. L0 hides the agent until the analyst decides, which is how agreement is measured. L2 lets an analyst approve high-confidence closes in a batch with a QA sample. L3 closes without a click.
            </p>
            <ul className="wb-levels">
              {TYPOLOGIES.map((t) => {
                const level = value.autonomy[t] ?? 1;
                return (
                  <li key={t} className="wb-levels__row">
                    <span className="wb-levels__name">{TYPOLOGY_LABEL[t]}</span>
                    <LevelControl typology={t} level={level} onPick={(l) => setLevel(t, l)} />
                    <p className="wb-levels__detail">{AUTONOMY_LEVELS[level].detail}</p>
                    {level === 3 && (
                      <p className="wb-warn" role="note">
                        <strong>L3 requires the QA bar.</strong> {L3_BAR}, plus written sign-off. Today the bar is a sign-off you record, not an automatic check against your QA data.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="panel" aria-labelledby={`${ids}-thr`}>
          <div className="panel__head">
            <h2 id={`${ids}-thr`}>Thresholds</h2>
            <span>applied on every run</span>
          </div>
          <div className="panel__body wb-sliders">
            {POLICY_FIELDS.map((f) => (
              <Slider key={f.key} f={f} value={value[f.key]} onChange={(v) => setField(f.key, v)} />
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby={`${ids}-never`}>
          <div className="panel__head">
            <h2 id={`${ids}-never`}>Never automated</h2>
            <span>locked by design</span>
          </div>
          <ul className="wb-locked">
            {NEVER_AUTOMATED.map((item, i) => (
              <li key={item}>
                <Icon name="lock" size={16} />
                <span id={`${ids}-lk-${i}`}>{item}</span>
                <label className="wb-locked__toggle">
                  <input type="checkbox" checked={false} disabled aria-describedby={`${ids}-lk-${i} ${ids}-lk-why`} onChange={() => {}} />
                  <span>Always a person</span>
                </label>
              </li>
            ))}
          </ul>
          <p id={`${ids}-lk-why`} className="wb-foot-note">
            These are not settings. No autonomy level, threshold or role can hand them to the agent.
          </p>
        </section>
      </fieldset>

      <section className="panel" aria-labelledby={`${ids}-diff`}>
        <div className="panel__head">
          <h2 id={`${ids}-diff`}>Changes from the default policy</h2>
          <span>{changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"}` : "none"}</span>
        </div>
        <div className="panel__body">
          {changes.length ? (
            <ul className="wb-diff">
              {changes.map((c) => (
                <li key={c.key}>
                  <span>{c.label}</span>
                  <span className="wb-diff__vals">
                    <span className="visually-hidden">from </span>
                    <s className="num">{c.from}</s> <Icon name="arrowRight" size={14} />
                    <span className="visually-hidden"> to </span>
                    <b className="num">{c.to}</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wb-foot-note wb-foot-note--flush">This matches the default policy.</p>
          )}
          {warnings.map((w) => (
            <p key={w} className="wb-warn">
              {w}
            </p>
          ))}
          <div className="wb-policy__actions">
            {onRerun && (
              <button type="button" className="btn btn-small" onClick={onRerun} disabled={readOnly || rerunning} aria-busy={rerunning || undefined}>
                {rerunning ? "Re-running open alerts" : "Re-run all open alerts with this policy"}
              </button>
            )}
            {changes.length > 0 && (
              <button type="button" className="btn btn-quiet btn-small" disabled={readOnly || rerunning} onClick={() => onChange({ ...DEFAULT_POLICY, version: value.version, provider: value.provider })}>
                Reset to defaults
              </button>
            )}
          </div>
          <p className="wb-foot-note wb-foot-note--flush" aria-live="polite">
            {rerunning ? "Re-running every open alert with the current settings. Recommendations update as each run finishes." : "New settings apply to the next run of each alert. Open alerts keep their current recommendation until they are re-run."}
          </p>
        </div>
      </section>
    </div>
  );
}
