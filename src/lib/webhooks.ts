import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq, inArray, sql } from "drizzle-orm";
import { appBaseUrl } from "./app-url";
import { appendAudit } from "./audit";
import type { DB } from "./db/client";
import { alerts, triageRuns, workspaces, type Recommendation, type WebhookFormat, type WebhookSettings } from "./db/schema";
import { REC_LABEL, TYPOLOGY_LABEL } from "./labels";

type Workspace = typeof workspaces.$inferSelect;

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

/** Events a workspace can subscribe to, in the order the settings form lists them. */
export const WEBHOOK_EVENTS = [
  { id: "alert.escalated", label: "Alert escalated to L2", hint: "An analyst escalates, or overrides to escalate." },
  { id: "alert.closed", label: "Alert closed", hint: "Analyst close, batch close or auto-close." },
  { id: "sar.decided", label: "SAR decision recorded", hint: "L2 records file or no file." },
  { id: "alert.assigned", label: "Alert assigned", hint: "Someone is made the owner of an alert." },
  { id: "alert.note", label: "Note with a mention", hint: "A note or handoff that @mentions a teammate." },
] as const;

export type SubscribableEvent = (typeof WEBHOOK_EVENTS)[number]["id"];
export type WebhookEvent = SubscribableEvent | "test";
export const WEBHOOK_EVENT_IDS: SubscribableEvent[] = WEBHOOK_EVENTS.map((e) => e.id);
export const DEFAULT_WEBHOOK_EVENTS: SubscribableEvent[] = ["alert.escalated", "sar.decided"];
export const WEBHOOK_FORMATS: { id: WebhookFormat; label: string }[] = [
  { id: "json", label: "JSON (signed)" },
  { id: "slack", label: "Slack Block Kit" },
  { id: "teams", label: "Microsoft Teams Adaptive Card" },
];

export function isSubscribableEvent(e: string): e is SubscribableEvent {
  return (WEBHOOK_EVENT_IDS as string[]).includes(e);
}

/** The alert fields every event carries. */
export interface WebhookAlert {
  id: string;
  ruleCode: string;
  typology: string;
  recommendation: Recommendation | null;
  confidence: number | null;
  riskScore: number | null;
  /** Rationale claims that cite at least one record. */
  citedClaims: number;
}

/** JSON body, exactly as documented on /integrations#webhooks. */
export interface WebhookJsonBody {
  event: WebhookEvent;
  created_at: string;
  alert: {
    id: string;
    rule_code: string;
    typology: string;
    recommendation: Recommendation | null;
    confidence: number | null;
    risk_score: number | null;
    cited_claims: number;
    url: string;
  };
}

const TITLE: Record<WebhookEvent, string> = {
  "alert.escalated": "Escalated to L2",
  "alert.closed": "Closed",
  "sar.decided": "SAR decision recorded",
  "alert.assigned": "Assigned",
  "alert.note": "New note",
  test: "Test event",
};

const PAST: Record<WebhookEvent, string> = {
  "alert.escalated": "was escalated to L2",
  "alert.closed": "was closed",
  "sar.decided": "has a SAR decision",
  "alert.assigned": "was assigned",
  "alert.note": "has a new note",
  test: "is a test event",
};

const typologyName = (t: string) => (TYPOLOGY_LABEL as Record<string, string>)[t] ?? t;
const recName = (r: Recommendation | null) => (r ? REC_LABEL[r] : "None yet");
const confText = (c: number | null) => (c == null ? "n/a" : c.toFixed(2));
const riskText = (r: number | null) => (r == null ? "n/a" : `${r} of 100`);

/** Slack treats &, < and > as control characters in text; escape anything that came from a person. */
function slackEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface BuildOptions {
  /** ISO timestamp for created_at. Defaults to now. */
  createdAt?: string;
  /** One line of context for Slack and Teams (who escalated, who was assigned). The JSON body keeps to the contract and leaves it out. */
  detail?: string;
}

/**
 * Builds the request body for one event. JSON follows the documented contract;
 * Slack and Teams mirror the shapes the public webhook tester sends.
 */
export function buildWebhookBody(format: WebhookFormat, event: WebhookEvent, alert: WebhookAlert, link: string, opts: BuildOptions = {}): object {
  const createdAt = opts.createdAt ?? new Date().toISOString();
  if (format === "json") {
    const body: WebhookJsonBody = {
      event,
      created_at: createdAt,
      alert: {
        id: alert.id,
        rule_code: alert.ruleCode,
        typology: alert.typology,
        recommendation: alert.recommendation,
        confidence: alert.confidence,
        risk_score: alert.riskScore,
        cited_claims: alert.citedClaims,
        url: link,
      },
    };
    return body;
  }

  const title = `${TITLE[event]}: ${alert.id}`;
  const facts: [string, string][] = [
    ["Typology", typologyName(alert.typology)],
    ["Recommendation", recName(alert.recommendation)],
    ["Confidence", confText(alert.confidence)],
    ["Risk score", riskText(alert.riskScore)],
    ["Cited claims", String(alert.citedClaims)],
    ["Rule", alert.ruleCode],
  ];
  const footnote =
    event === "test" ? "Test message from Assay workspace settings. Synthetic alert, no real customer." : `Assay event ${event} at ${createdAt.slice(0, 16).replace("T", " ")} UTC.`;

  if (format === "slack") {
    const blocks: object[] = [
      { type: "header", text: { type: "plain_text", text: title } },
      { type: "section", fields: facts.map(([k, v]) => ({ type: "mrkdwn", text: `*${k}*\n${slackEscape(v)}` })) },
    ];
    if (opts.detail) blocks.push({ type: "section", text: { type: "mrkdwn", text: slackEscape(opts.detail) } });
    blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Assay" }, url: link }] });
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footnote }] });
    return { text: `${alert.id} (${typologyName(alert.typology).toLowerCase()}) ${PAST[event]}.`, blocks };
  }

  const body: object[] = [
    { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
    { type: "FactSet", facts: facts.map(([title, value]) => ({ title, value })) },
  ];
  if (opts.detail) body.push({ type: "TextBlock", text: opts.detail, wrap: true });
  body.push({ type: "TextBlock", text: footnote, isSubtle: true, size: "Small", wrap: true });
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
          body,
          actions: [{ type: "Action.OpenUrl", title: "Open in Assay", url: link }],
        },
      },
    ],
  };
}

/** "sha256=<hex>" where hex is the HMAC-SHA256 of the exact bytes sent. */
export function signBody(secret: string, raw: string): string {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/* ------------------------------------------------------------------ */
/* URL guard                                                           */
/* ------------------------------------------------------------------ */

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata endpoints
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

/** Expands an IPv6 literal to 8 groups. Returns null when it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const p = v4[1].split(".").map(Number);
    tail = [(p[0] << 8) | p[1], (p[2] << 8) | p[3]];
    s = s.slice(0, -v4[1].length); // "::ffff:", "::" or "1:2:3:4:5:6:"
    if (s.endsWith(":") && !s.endsWith("::")) s = s.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)) : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill(0), ...rest, ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function ipv6Private(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses: judge the IPv4 part.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return ipv4Private(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  return false;
}

/** True for hosts that point inside the network: loopback, private, link-local and unique-local literals, and localhost names. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const kind = isIP(h);
  if (kind === 4) return ipv4Private(h);
  if (kind === 6) return ipv6Private(h);
  return false;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Accepts only https URLs to public hosts. A basic SSRF guard: literal private
 * and loopback addresses and localhost are refused here, and dispatch also
 * refuses a host whose DNS answer is private.
 */
export function validateWebhookUrl(raw: string): UrlCheck {
  const v = raw.trim();
  if (!v) return { ok: false, error: "Enter the webhook URL." };
  if (v.length > 2048) return { ok: false, error: "That URL is too long." };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, error: "That is not a complete URL. Paste the whole address, starting with https://." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https://." };
  if (u.username || u.password) return { ok: false, error: "Put credentials in the signing secret, not in the URL." };
  if (isPrivateHost(u.hostname)) return { ok: false, error: "That host is a private, loopback or local address. Use a public https endpoint." };
  return { ok: true, url: u.toString() };
}

async function resolvesPrivate(hostname: string): Promise<boolean> {
  const h = hostname.replace(/^\[|\]$/g, "");
  if (isIP(h)) return false; // literals were already checked
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answers = await Promise.race([
      lookup(h, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 2000);
      }),
    ]);
    return answers.some((a) => isPrivateHost(a.address));
  } catch {
    return false; // let the request itself fail and report it
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

export interface WebhookDelivery {
  ok: boolean;
  status: number | null;
  deliveryId: string;
  error?: string;
  ms: number;
}

/** Synthetic alert used by "Send test". Matches the public tester's sample. */
export const TEST_ALERT: WebhookAlert = {
  id: "ALT-7Q2M4K",
  ruleCode: "CASH-STRUCT-01",
  typology: "structuring",
  recommendation: "escalate",
  confidence: 0.91,
  riskScore: 82,
  citedClaims: 6,
};

export function alertLink(alertId: string): string {
  return `${appBaseUrl()}/app/alerts/${encodeURIComponent(alertId)}`;
}

/**
 * Sends one event to the workspace's webhook. POSTs JSON with X-Assay-Event,
 * X-Assay-Signature and X-Assay-Delivery headers, gives up after 5 seconds,
 * does not follow redirects, and records "webhook.delivered" or
 * "webhook.failed" in the audit log. Never throws.
 */
export async function dispatchWebhook(
  ws: Workspace,
  event: WebhookEvent,
  payload: { alert: WebhookAlert; detail?: string; link?: string },
  opts: { db?: DB; fetchImpl?: typeof fetch; timeoutMs?: number; actor?: string } = {},
): Promise<WebhookDelivery> {
  const deliveryId = randomUUID();
  const started = Date.now();
  const cfg: WebhookSettings | undefined = ws.settings.webhook;
  if (!cfg?.url) return { ok: false, status: null, deliveryId, error: "No webhook is configured.", ms: 0 };

  let result: WebhookDelivery;
  let host = "";
  try {
    const check = validateWebhookUrl(cfg.url);
    if (!check.ok) throw new Error(check.error);
    const url = new URL(check.url);
    host = url.host;
    if (await resolvesPrivate(url.hostname)) throw new Error("The webhook host resolves to a private address.");
    const raw = JSON.stringify(
      buildWebhookBody(cfg.format, event, payload.alert, payload.link ?? alertLink(payload.alert.id), { detail: payload.detail }),
    );
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Assay-Webhook/1",
        "X-Assay-Event": event,
        "X-Assay-Signature": signBody(cfg.secret, raw),
        "X-Assay-Delivery": deliveryId,
      },
      body: raw,
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    const ok = res.status >= 200 && res.status < 300;
    result = { ok, status: res.status, deliveryId, ms: Date.now() - started, error: ok ? undefined : `The endpoint answered ${res.status}.` };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    result = {
      ok: false,
      status: null,
      deliveryId,
      ms: Date.now() - started,
      error: timedOut ? "No answer within 5 seconds." : err instanceof Error ? err.message : "Delivery failed.",
    };
  }

  try {
    const db = opts.db ?? (await (await import("./db/client")).getDb());
    await appendAudit(db, {
      workspaceId: ws.id,
      actorType: "system",
      actorName: opts.actor ?? "assay-webhook",
      action: result.ok ? "webhook.delivered" : "webhook.failed",
      entityType: event === "test" ? "webhook" : "alert",
      entityId: event === "test" ? "test" : payload.alert.id,
      payload: { event, deliveryId, status: result.status, host, format: cfg.format, ms: result.ms, ...(result.error ? { error: result.error } : {}) },
    });
  } catch (err) {
    console.error("Could not record webhook delivery", err);
  }
  return result;
}

/** Loads the fields an event carries for each alert, from the alert and its latest run. */
export async function loadWebhookAlerts(db: DB, wsId: string, alertIds: string[]): Promise<WebhookAlert[]> {
  if (!alertIds.length) return [];
  const rows = await db
    .select({
      id: alerts.id,
      ruleCode: alerts.ruleCode,
      typology: alerts.typology,
      recommendation: triageRuns.recommendation,
      confidence: triageRuns.confidence,
      riskScore: triageRuns.riskScore,
      rationale: triageRuns.rationale,
    })
    .from(alerts)
    .leftJoin(triageRuns, eq(triageRuns.id, alerts.latestRunId))
    .where(and(eq(alerts.workspaceId, wsId), inArray(alerts.id, alertIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return alertIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id,
      ruleCode: r.ruleCode,
      typology: r.typology,
      recommendation: r.recommendation ?? null,
      confidence: r.confidence ?? null,
      riskScore: r.riskScore ?? null,
      citedClaims: (r.rationale ?? []).filter((c) => c.citations.length > 0).length,
    }));
}

/** Runs work after the response is sent when called inside a request, otherwise right away in the background. */
async function inBackground(task: () => Promise<unknown>): Promise<void> {
  const run = () =>
    task().catch((err) => {
      console.error("Webhook task failed", err);
    });
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    void run();
  }
}

export function subscribed(ws: Workspace, event: SubscribableEvent): boolean {
  const cfg = ws.settings.webhook;
  return !!cfg?.url && !!cfg.secret && cfg.events.includes(event);
}

/**
 * Queues an event for one or more alerts if the workspace subscribes to it.
 * Delivery happens after the response, so the analyst never waits on a slow
 * endpoint, and it never throws into the caller. Batches send at most 50
 * events, one after another.
 */
export async function queueWebhook(db: DB, ws: Workspace, event: SubscribableEvent, alertIds: string | string[], detail?: string): Promise<void> {
  try {
    if (!subscribed(ws, event)) return;
    const ids = (Array.isArray(alertIds) ? alertIds : [alertIds]).slice(0, 50);
    if (!ids.length) return;
    await inBackground(async () => {
      const items = await loadWebhookAlerts(db, ws.id, ids);
      for (const alert of items) await dispatchWebhook(ws, event, { alert, detail }, { db });
    });
  } catch (err) {
    console.error("Could not queue webhook", err);
  }
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/**
 * Stores (or, with null, removes) the workspace webhook. Written with a jsonb
 * merge so it never touches the policy fields or bumps the policy version.
 * Records "settings.webhook_updated" with the host, format and events only:
 * the URL path and the secret stay out of the audit log.
 */
export async function saveWebhookSettings(
  db: DB,
  ws: Workspace,
  next: WebhookSettings | null,
  actor: string,
  meta: { secretRotated?: boolean } = {},
): Promise<void> {
  if (next) {
    await db
      .update(workspaces)
      .set({ settings: sql`${workspaces.settings} || jsonb_build_object('webhook', ${JSON.stringify(next)}::jsonb)` })
      .where(eq(workspaces.id, ws.id));
  } else {
    await db
      .update(workspaces)
      .set({ settings: sql`${workspaces.settings} - 'webhook'` })
      .where(eq(workspaces.id, ws.id));
  }
  const prev = ws.settings.webhook;
  const hostOf = (u?: string) => {
    try {
      return u ? new URL(u).host : null;
    } catch {
      return null;
    }
  };
  await appendAudit(db, {
    workspaceId: ws.id,
    actorType: "human",
    actorName: actor,
    action: "settings.webhook_updated",
    entityType: "webhook",
    entityId: ws.id,
    payload: next
      ? {
          status: prev ? "updated" : "created",
          host: hostOf(next.url),
          urlChanged: prev ? prev.url !== next.url : true,
          format: next.format,
          events: next.events,
          secretRotated: !!meta.secretRotated,
        }
      : { status: "removed", host: hostOf(prev?.url) },
  });
}
