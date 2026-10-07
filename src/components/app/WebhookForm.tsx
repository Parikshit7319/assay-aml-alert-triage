"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-types";

type Format = "json" | "slack" | "teams";
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type NoArgAction = (prev: ActionState) => Promise<ActionState>;

export interface WebhookFormProps {
  /** The saved webhook, without its secret. Null when none is configured. */
  current: { url: string; format: Format; events: string[]; secretHint: string | null } | null;
  events: readonly { id: string; label: string; hint: string }[];
  formats: readonly { id: Format; label: string }[];
  defaultEvents: readonly string[];
  canEdit: boolean;
  /** Shown instead of the form controls' purpose when editing is not allowed. */
  disabledReason?: string;
  actions: { save: Action; rotate: NoArgAction; test: NoArgAction; remove: NoArgAction };
}

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="form-error">{state.error}</p>;
  if (state.ok) return <p className="form-ok">{state.ok}</p>;
  return null;
}

function SecretReveal({ secret }: { secret: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <div className="key-reveal">
      <b>Signing secret. Copy it now; it will not be shown again.</b>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
        <code style={{ wordBreak: "break-all" }}>{secret}</code>
        <button className="btn btn-outline btn-small" type="button" onClick={copy}>
          Copy secret
        </button>
      </div>
      <span role="status" aria-live="polite" className="decide__hint">
        {copied === "copied" ? "Copied to the clipboard." : copied === "failed" ? "Could not copy. Select the text and copy it by hand." : ""}
      </span>
    </div>
  );
}

/**
 * Outbound webhook settings: endpoint, format, events, signing secret, and a
 * signed test delivery. Server actions come in as props so this component has
 * no server imports of its own.
 */
export function WebhookForm({ current, events, formats, defaultEvents, canEdit, disabledReason, actions }: WebhookFormProps) {
  const [saveState, save, saving] = useActionState<ActionState, FormData>(actions.save, {});
  const [rotateState, rotate, rotating] = useActionState<ActionState>(actions.rotate, {});
  const [testState, test, testing] = useActionState<ActionState>(actions.test, {});
  const [removeState, remove, removing] = useActionState<ActionState>(actions.remove, {});
  const secret = rotateState.secret ?? saveState.secret;
  const chosen = new Set(current?.events ?? defaultEvents);

  return (
    <div className="form-stack">
      {!canEdit && disabledReason && <p className="decide__hint">{disabledReason}</p>}
      <form action={save} className="form-stack">
        <label className="field">
          <span>Endpoint URL</span>
          <input
            type="url"
            name="url"
            inputMode="url"
            defaultValue={current?.url ?? ""}
            placeholder="https://hooks.slack.com/services/... or https://your-system.example/hooks/assay"
            autoComplete="off"
            spellCheck={false}
            required
            disabled={!canEdit}
            aria-describedby="webhook-url-hint"
          />
          <small id="webhook-url-hint">https only. Private, loopback and local addresses are refused.</small>
        </label>
        <label className="field">
          <span>Format</span>
          <select name="format" defaultValue={current?.format ?? "json"} disabled={!canEdit}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset style={{ margin: 0, padding: 0, border: 0, display: "grid", gap: 8 }} disabled={!canEdit}>
          <legend style={{ fontWeight: 650, marginBottom: 6 }}>Events to send</legend>
          {events.map((e) => (
            <label key={e.id} className="check">
              <input type="checkbox" name="events" value={e.id} defaultChecked={chosen.has(e.id)} />
              <span>
                {e.label} <code>{e.id}</code>
                <span className="cell-sub" style={{ whiteSpace: "normal", maxWidth: "none" }}>
                  {e.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <button className="btn btn-small" type="submit" disabled={!canEdit || saving}>
            {saving ? "Saving" : current ? "Save changes" : "Save webhook"}
          </button>
        </div>
        <div role="status" aria-live="polite">
          <Result state={saveState} />
        </div>
      </form>

      {secret && <SecretReveal secret={secret} />}

      {current && (
        <>
          <p className="decide__hint" style={{ margin: 0 }}>
            {current.secretHint ? <>Signing secret set, ending in <code>{current.secretHint}</code>. </> : null}
            Each request carries <code>X-Assay-Signature: sha256=&lt;hex&gt;</code>, an HMAC-SHA256 of the raw body under this secret, plus <code>X-Assay-Event</code> and{" "}
            <code>X-Assay-Delivery</code>.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <form action={test}>
              <button className="btn btn-outline btn-small" type="submit" disabled={!canEdit || testing}>
                {testing ? "Sending test" : "Send test"}
              </button>
            </form>
            <form action={rotate}>
              <button className="btn btn-outline btn-small" type="submit" disabled={!canEdit || rotating}>
                {rotating ? "Rotating" : "Rotate secret"}
              </button>
            </form>
            <form action={remove}>
              <button className="btn btn-quiet btn-small" type="submit" disabled={!canEdit || removing}>
                {removing ? "Removing" : "Remove webhook"}
              </button>
            </form>
          </div>
          <div role="status" aria-live="polite">
            <Result state={testState} />
            <Result state={rotateState} />
            <Result state={removeState} />
          </div>
        </>
      )}
    </div>
  );
}
