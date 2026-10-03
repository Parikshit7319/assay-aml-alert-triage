"use client";

import { useActionState } from "react";
import { updatePolicyAction, type ActionState } from "@/app/app/actions";
import type { PolicySettings } from "@/lib/db/schema";
import { TYPOLOGIES, TYPOLOGY_LABEL } from "@/lib/labels";

const PROVIDER_LABEL: Record<PolicySettings["provider"], string> = {
  simulated: "Rules model (deterministic, no API key)",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
  "azure-openai": "Azure OpenAI in your subscription",
};

export function PolicyForm({
  settings,
  providers,
  liveAllowed,
  canEdit,
}: {
  settings: PolicySettings;
  providers: Record<PolicySettings["provider"], boolean>;
  liveAllowed: boolean;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updatePolicyAction, {});
  return (
    <form action={action} className="form-stack">
      <fieldset disabled={!canEdit || pending} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 16 }}>
        <table className="table autonomy-table">
          <thead>
            <tr>
              <th>Alert type</th>
              <th>Autonomy</th>
            </tr>
          </thead>
          <tbody>
            {TYPOLOGIES.map((ty) => (
              <tr key={ty}>
                <td>{TYPOLOGY_LABEL[ty]}</td>
                <td>
                  <select name={`autonomy_${ty}`} defaultValue={settings.autonomy[ty]} aria-label={`Autonomy for ${TYPOLOGY_LABEL[ty]}`}>
                    <option value={0}>L0 Shadow</option>
                    <option value={1}>L1 Recommend</option>
                    <option value={2}>L2 Batch approve</option>
                    <option value={3}>L3 Auto-close</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="check">
          <input type="checkbox" name="l3_attest" />
          <span>
            For any type set to L3: it has reached 98% QA agreement on at least 2,000 reviewed alerts, and the BSA officer has approved auto-close in writing.
          </span>
        </label>
        <div className="form-row">
          <label className="field">
            <span>Close confidence floor</span>
            <input type="number" name="closeConfidenceFloor" step="0.01" min="0.5" max="0.99" defaultValue={settings.closeConfidenceFloor} />
            <small>A recommended close below this becomes human review.</small>
          </label>
          <label className="field">
            <span>Auto-close confidence floor</span>
            <input type="number" name="autoCloseConfidenceFloor" step="0.01" min="0.8" max="0.999" defaultValue={settings.autoCloseConfidenceFloor} />
            <small>Applies only to L3 alert types.</small>
          </label>
          <label className="field">
            <span>Watchlist similarity that forces L2</span>
            <input type="number" name="watchlistForceL2Similarity" step="0.01" min="0.7" max="0.99" defaultValue={settings.watchlistForceL2Similarity} />
            <small>Jaro-Winkler on normalized names.</small>
          </label>
          <label className="field">
            <span>Minimum transactions to decide</span>
            <input type="number" name="minTransactionsForDecision" step="1" min="1" max="100" defaultValue={settings.minTransactionsForDecision} />
            <small>Below this in 90 days, the agent abstains.</small>
          </label>
          <label className="field">
            <span>QA sample rate</span>
            <input type="number" name="qaSampleRate" step="0.01" min="0.01" max="1" defaultValue={settings.qaSampleRate} />
            <small>Share of agent-assisted closes sent to QA.</small>
          </label>
          <label className="field">
            <span>Internal review SLA, days</span>
            <input type="number" name="internalSlaDays" step="1" min="1" max="120" defaultValue={settings.internalSlaDays} />
            <small>Your policy for alert age. Separate from the SAR clock.</small>
          </label>
        </div>
        <label className="field">
          <span>No-SAR rationale depth</span>
          <select name="rationaleDepth" defaultValue={settings.rationaleDepth}>
            <option value="full">Full: keep the complete cited rationale on every close</option>
            <option value="standard">Standard: keep a short rationale on routine closes</option>
          </select>
          <small>
            FinCEN&apos;s October 2025 FAQ says there is no requirement to document a decision not to file. The FFIEC manual still recommends it. Your policy decides.
          </small>
        </label>
        <label className="field">
          <span>Model</span>
          <select name="provider" defaultValue={settings.provider}>
            {(Object.keys(PROVIDER_LABEL) as PolicySettings["provider"][]).map((p) => (
              <option key={p} value={p} disabled={p !== "simulated" && (!providers[p] || !liveAllowed)}>
                {PROVIDER_LABEL[p]}
                {p !== "simulated" && !providers[p] ? " (not configured on this server)" : p !== "simulated" && !liveAllowed ? " (Team plan)" : ""}
              </option>
            ))}
          </select>
          <small>Live models need the Team plan and a key set by the server operator. Runs fall back to the rules model otherwise, and record which model ran.</small>
        </label>
        <div>
          <button className="btn" type="submit">
            {pending ? "Saving" : "Save as a new policy version"}
          </button>
        </div>
      </fieldset>
      {!canEdit && <p className="decide__hint">Only owners and admins can change policy.</p>}
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="form-ok">{state.ok}</p>}
    </form>
  );
}
