"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { withBase } from "@/lib/base-path";
import "@/app/(site)/content.css";

type Format = "slack" | "teams";
type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; format: Format } | { kind: "error"; message: string };

/** The sample event every test message describes. Synthetic, matching the demo's hero structuring alert. */
const SAMPLE = {
  alertId: "ALT-7Q2M4K",
  ruleCode: "CASH-STRUCT-01",
  typology: "Structuring",
  recommendation: "Escalate",
  confidence: 0.91,
  riskScore: 82,
  citedClaims: 6,
  summary: "Nine cash deposits from $9,400 to $9,900 at three locations over 12 days, including two days with deposits at two different locations. A staff note records the customer asking whether deposits over $10,000 are reported.",
};

const FOOTNOTE = "Test message sent from the Assay integrations page. Synthetic data, no real customer.";

function slackPayload(link: string) {
  return {
    text: `${SAMPLE.alertId} (${SAMPLE.typology.toLowerCase()}) was escalated to L2. Test message, synthetic data.`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `Escalated to L2: ${SAMPLE.alertId}` } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Typology*\n${SAMPLE.typology}` },
          { type: "mrkdwn", text: `*Recommendation*\n${SAMPLE.recommendation}` },
          { type: "mrkdwn", text: `*Confidence*\n${SAMPLE.confidence.toFixed(2)}` },
          { type: "mrkdwn", text: `*Risk score*\n${SAMPLE.riskScore} of 100` },
          { type: "mrkdwn", text: `*Cited claims*\n${SAMPLE.citedClaims}` },
          { type: "mrkdwn", text: `*Rule*\n${SAMPLE.ruleCode}` },
        ],
      },
      { type: "section", text: { type: "mrkdwn", text: SAMPLE.summary } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Assay" }, url: link }] },
      { type: "context", elements: [{ type: "mrkdwn", text: FOOTNOTE }] },
    ],
  };
}

function teamsPayload(link: string) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: `Escalated to L2: ${SAMPLE.alertId}`, weight: "Bolder", size: "Medium", wrap: true },
            {
              type: "FactSet",
              facts: [
                { title: "Typology", value: SAMPLE.typology },
                { title: "Recommendation", value: SAMPLE.recommendation },
                { title: "Confidence", value: SAMPLE.confidence.toFixed(2) },
                { title: "Risk score", value: `${SAMPLE.riskScore} of 100` },
                { title: "Cited claims", value: String(SAMPLE.citedClaims) },
                { title: "Rule", value: SAMPLE.ruleCode },
              ],
            },
            { type: "TextBlock", text: SAMPLE.summary, wrap: true },
            { type: "TextBlock", text: FOOTNOTE, isSubtle: true, size: "Small", wrap: true },
          ],
          actions: [{ type: "Action.OpenUrl", title: "Open in Assay", url: link }],
        },
      },
    ],
  };
}

const TEAMS_HOSTS = [".logic.azure.com", ".environment.api.powerplatform.com", ".webhook.office.com"];

function detectFormat(raw: string): Format | null {
  const v = raw.trim();
  if (v.startsWith("https://hooks.slack.com/")) return "slack";
  try {
    const h = new URL(v).hostname;
    if (TEAMS_HOSTS.some((t) => h.endsWith(t))) return "teams";
  } catch {
    /* not a URL yet */
  }
  return null;
}

/** Returns an error message, or null when the URL is acceptable for the chosen format. */
function checkUrl(raw: string, format: Format): string | null {
  const v = raw.trim();
  if (!v) return "Paste an incoming webhook URL first.";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "That is not a complete URL. Paste the whole webhook address, starting with https://.";
  }
  if (u.protocol !== "https:") return "Webhook URLs must start with https://.";
  if (format === "slack") {
    if (!v.startsWith("https://hooks.slack.com/")) return "Slack incoming webhook URLs start with https://hooks.slack.com/. Check that you copied the webhook URL, not the channel link.";
    return null;
  }
  if (!TEAMS_HOSTS.some((t) => u.hostname.endsWith(t))) {
    return "Teams webhook URLs come from a Workflows trigger (an address on logic.azure.com or environment.api.powerplatform.com) or an older connector on webhook.office.com.";
  }
  return null;
}

/** Minimal JSON colouring: keys plain, string values highlighted. */
function colour(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push(json.slice(last, m.index));
    if (m[2]) out.push(m[1] + m[2]);
    else
      out.push(
        <span className="s" key={i++}>
          {m[1]}
        </span>,
      );
    last = re.lastIndex;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

const noop = () => () => {};

export function WebhookTester() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<Format>("slack");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // The button in the test message links to this site's demo. Absolute only once we know the origin.
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const link = origin ? new URL(withBase("/demo/"), origin).href : withBase("/demo/");
  const body = useMemo(() => JSON.stringify(format === "slack" ? slackPayload(link) : teamsPayload(link), null, 2), [format, link]);

  const legacyTeams = (() => {
    try {
      return format === "teams" && new URL(url.trim()).hostname.endsWith(".webhook.office.com");
    } catch {
      return false;
    }
  })();

  function onUrl(v: string) {
    setUrl(v);
    const f = detectFormat(v);
    if (f) setFormat(f);
    if (status.kind !== "idle" && status.kind !== "sending") setStatus({ kind: "idle" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = checkUrl(url, format);
    if (err) {
      setStatus({ kind: "error", message: err });
      inputRef.current?.focus();
      return;
    }
    setStatus({ kind: "sending" });
    try {
      // no-cors: Slack and Teams accept a simple text/plain POST of JSON. The response is opaque,
      // so success here only means the request left the browser.
      await fetch(url.trim(), { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body, referrerPolicy: "no-referrer", credentials: "omit" });
      setStatus({ kind: "sent", format });
    } catch {
      setStatus({ kind: "error", message: "The browser could not reach that address. Check the URL, or try from a network that does not block it." });
    }
  }

  const service = (f: Format) => (f === "slack" ? "Slack's" : "Teams'");

  return (
    <form className="webhook-tester" onSubmit={onSubmit} noValidate aria-labelledby={`${id}-h`}>
      <div>
        <h3 id={`${id}-h`}>Send a test escalation to your channel</h3>
        <p className="c-note" style={{ marginTop: 6 }}>
          The URL stays in this page&apos;s memory. It is not saved, logged or sent anywhere except to Slack or Microsoft, straight from your browser.
        </p>
      </div>
      <div className="row">
        <label className="field">
          <span>Incoming webhook URL</span>
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            placeholder={format === "slack" ? "https://hooks.slack.com/services/..." : "https://...logic.azure.com/workflows/..."}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${id}-hint`}
            aria-invalid={status.kind === "error" ? true : undefined}
          />
          <small id={`${id}-hint`}>
            Slack: Apps, Incoming Webhooks. Teams: a Workflows flow that starts &ldquo;When a Teams webhook request is received&rdquo;.
          </small>
        </label>
        <fieldset className="c-wt__formats">
          <legend>Format</legend>
          <div className="c-wt__opts">
            {(["slack", "teams"] as const).map((f) => (
              <label key={f}>
                <input type="radio" name={`${id}-format`} value={f} checked={format === f} onChange={() => setFormat(f)} />
                {f === "slack" ? "Slack" : "Teams"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {legacyTeams && (
        <p className="c-note" style={{ margin: 0 }}>
          This is an Office 365 connector URL. Microsoft retired those connectors in May 2026, so it may no longer accept messages. A Workflows URL will.
        </p>
      )}
      <div>
        <span className="c-label" id={`${id}-pre`}>
          Exact JSON that will be sent ({format === "slack" ? "Slack Block Kit" : "Teams Adaptive Card"})
        </span>
        <pre className="code-block c-wt__preview" tabIndex={0} aria-labelledby={`${id}-pre`} style={{ marginTop: 8 }}>
          {colour(body)}
        </pre>
      </div>
      <div className="c-wt__actions">
        <button className="btn" type="submit" disabled={status.kind === "sending"} data-track="webhook-test-send">
          {status.kind === "sending" ? "Sending..." : "Send test message"}
        </button>
        <span className="fine">One POST, from your browser, nothing else.</span>
      </div>
      <div role="status" aria-live="polite" className="c-wt__result">
        {status.kind === "sent" && (
          <p className="form-ok">Sent. Check the channel. Browsers cannot read {service(status.format)} reply, so a typo in the URL fails silently.</p>
        )}
        {status.kind === "error" && <p className="form-error">{status.message}</p>}
      </div>
    </form>
  );
}
