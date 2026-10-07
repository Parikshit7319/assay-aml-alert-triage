import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Guilloche } from "@/components/Guilloche";
import { WebhookTester } from "@/components/site/WebhookTester";
import { Icon, type IconName } from "@/components/viz/Icon";
import { CSV_COLUMNS, MAX_CSV_ALERTS, REQUIRED_CSV_COLUMNS } from "@/lib/import-schema";
import "../content.css";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "How Assay connects: CSV import and a REST API for alerts in, signed JSON, Slack and Microsoft Teams webhooks for events out, and Anthropic, OpenAI or Azure OpenAI as the model. Case manager connectors are on the roadmap, labeled as such.",
};

type Item = { icon?: IconName; name: string; body: ReactNode };

const AVAILABLE: Item[] = [
  {
    icon: "upload",
    name: "CSV import",
    body: (
      <>
        One row per transaction, grouped by <code>alert_id</code>. Up to {MAX_CSV_ALERTS} alerts a file, validated before anything is stored. Download the column template from the import screen.
      </>
    ),
  },
  {
    icon: "api",
    name: "REST API",
    body: (
      <>
        <code>POST /api/v1/alerts</code> with the alert, customer and transactions; the response carries the recommendation. Bearer keys per workspace. <Link href="/developers">API reference</Link>
      </>
    ),
  },
  {
    icon: "webhook",
    name: "Outbound webhook",
    body: (
      <>
        Events as plain JSON, a Slack message or a Microsoft Teams card, signed with <code>X-Assay-Signature</code>, an HMAC-SHA256 of the raw body.
      </>
    ),
  },
  { name: "Anthropic", body: <>Claude models through the Anthropic API, with your workspace&apos;s own key. Selected per workspace in policy settings.</> },
  { name: "OpenAI", body: <>OpenAI models through the OpenAI API, with your own key. Same prompt, same validation, same policy rules as every other provider.</> },
  { name: "Azure OpenAI", body: <>Your own deployment in your own Azure subscription. The default for Enterprise, so prompts go to an endpoint you control.</> },
];

const PLANNED: Item[] = [
  { name: "NICE Actimize", body: <>Pull alerts from the Actimize queue and write the recommendation and cited rationale back to the case.</> },
  { name: "Nasdaq Verafin", body: <>Bring Verafin alerts in for first-pass triage and return the disposition with its evidence trail.</> },
  { name: "Hummingbird", body: <>Open a Hummingbird case on escalation, carrying the draft SAR narrative and cited records.</> },
  { name: "Unit21", body: <>Triage Unit21 alerts and sync dispositions back, for fintechs and sponsor-bank programs already on it.</> },
  { name: "Microsoft Sentinel", body: <>Stream the audit log, including policy changes and locked alerts, into Sentinel for security monitoring.</> },
  { name: "Dynamics 365 and Dataverse", body: <>Write alerts, runs and decisions to Dataverse tables for teams that report from Dynamics 365 or Power BI.</> },
];

const PAYLOAD = `{
  "event": "alert.escalated",
  "created_at": "2026-10-06T14:32:08Z",
  "alert": {
    "id": "ALT-7Q2M4K",
    "rule_code": "CASH-STRUCT-01",
    "typology": "structuring",
    "recommendation": "escalate",
    "confidence": 0.91,
    "risk_score": 82,
    "cited_claims": 6,
    "url": "https://YOUR-DEPLOYMENT/app/alerts/ALT-7Q2M4K"
  }
}`;

const VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";

// Sign over the exact bytes received, so keep the raw body.
function verifyAssay(rawBody, header, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const app = express();
app.post("/hooks/assay", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifyAssay(req.body, req.get("X-Assay-Signature"), process.env.ASSAY_WEBHOOK_SECRET)) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.body.toString("utf8"));
  // event.event === "alert.escalated": open a case, page the L2 queue, etc.
  res.status(204).end();
});`;

/** Tiny highlighter for the two snippets: comments and strings only. */
function hl(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    out.push(
      <span key={i++} className={m[1] ? "c" : "s"}>
        {m[0]}
      </span>,
    );
    last = re.lastIndex;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function Grid({ items, status }: { items: Item[]; status: "now" | "planned" }) {
  return (
    <div className="int-grid">
      {items.map((it) => (
        <div key={it.name}>
          <h3>
            {it.icon && <Icon name={it.icon} size={20} />}
            {it.name}
          </h3>
          <p>{it.body}</p>
          {status === "now" ? <span className="pill pill--done">Available now</span> : <span className="pill pill--plan">Planned, not available</span>}
        </div>
      ))}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="c-int">
      <header className="ph">
        <div className="wrap">
          <p className="kicker">Integrations</p>
          <h1>Alerts in by file or API. Events out by signed webhook. Your model, your key.</h1>
          <p className="ph__lede">
            Assay sits between your transaction-monitoring system and the place your team works cases. Here is what connects today, and what is on the roadmap. Planned items are labeled planned; none of them works yet.
          </p>
        </div>
      </header>

      <section className="sec">
        <div className="wrap">
          <div className="c-int-head">
            <h2>Available now</h2>
            <p>In the code and in the demo or server edition today.</p>
          </div>
          <Grid items={AVAILABLE} status="now" />

          <div className="c-int-head" style={{ marginTop: 72 }}>
            <h2>On the roadmap</h2>
            <p>Built in the order design partners need them. Product names belong to their owners; no affiliation or endorsement implied.</p>
          </div>
          <Grid items={PLANNED} status="planned" />
        </div>
      </section>

      <section className="sec sec--sheet" id="webhooks">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">Outbound webhooks</p>
            <h2>An escalation, as your system receives it.</h2>
            <p>
              A POST with <code>Content-Type: application/json</code> and an <code>X-Assay-Signature: sha256=&lt;hex&gt;</code> header, where the hex is an HMAC-SHA256 of the raw request body under your webhook secret. Verify it before you trust
              the event.
            </p>
          </div>
          <div className="split split--even split--top">
            <div>
              <p className="c-code-cap">
                Example <code>alert.escalated</code> payload. Synthetic alert.
              </p>
              <pre className="code-block" tabIndex={0} aria-label="Example webhook payload">
                {hl(PAYLOAD)}
              </pre>
            </div>
            <div>
              <p className="c-code-cap">Verifying the signature in Node.js. Compare in constant time, and hash the bytes you received, not re-serialized JSON.</p>
              <pre className="code-block" tabIndex={0} aria-label="Node.js signature verification example">
                {hl(VERIFY)}
              </pre>
            </div>
          </div>
          <p className="c-note">Slack and Teams do not check signatures. For those formats, the webhook URL is the secret: keep it out of tickets and screenshots.</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">Try it</p>
            <h2>Send a sample escalation to your own channel.</h2>
            <p className="split__lede">
              Paste a Slack or Teams incoming-webhook URL and the page posts a sample escalation for the demo&apos;s structuring alert, in that service&apos;s format. It goes straight from your browser; nothing passes through Assay.
            </p>
          </div>
          <WebhookTester />
        </div>
      </section>

      <section className="sec sec--deep">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">CSV template</p>
            <h2>{CSV_COLUMNS.length} columns, one row per transaction.</h2>
            <p className="split__lede">
              Rows with the same <code>alert_id</code> become one alert. The {REQUIRED_CSV_COLUMNS.length} columns in bold are required; the rest make the evidence better. Larger volumes go through the API.
            </p>
          </div>
          <ol className="c-sections" aria-label="CSV columns in order">
            {CSV_COLUMNS.map((c) => (
              <li key={c}>{(REQUIRED_CSV_COLUMNS as readonly string[]).includes(c) ? <b>{c}</b> : c}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cta">
        <Guilloche className="cta__rosette" size={640} />
        <div className="wrap">
          <h2>Need a connector that is not built yet?</h2>
          <p>Design partners set the order of the roadmap. Tell me which case manager and monitoring system you run, and I will tell you honestly how far off it is.</p>
          <div className="actions">
            <Link className="btn btn-lg btn-light" href="/demo">
              Try the live demo
            </Link>
            <Link className="btn btn-lg btn-ghost-light" href="/pilot">
              Become a design partner
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
