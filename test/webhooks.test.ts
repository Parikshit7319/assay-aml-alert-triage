import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb, type DB } from "@/lib/db/client";
import { auditEvents, workspaces } from "@/lib/db/schema";
import { createDemoWorkspace } from "@/lib/demo/seed";
import {
  buildWebhookBody,
  dispatchWebhook,
  isPrivateHost,
  saveWebhookSettings,
  signBody,
  TEST_ALERT,
  validateWebhookUrl,
  type WebhookAlert,
} from "@/lib/webhooks";
import { updatePolicy } from "@/lib/workflow";

const alert: WebhookAlert = {
  id: "ALT-7Q2M4K",
  ruleCode: "CASH-STRUCT-01",
  typology: "structuring",
  recommendation: "escalate",
  confidence: 0.91,
  riskScore: 82,
  citedClaims: 6,
};
const link = "https://assay.example/app/alerts/ALT-7Q2M4K";

describe("buildWebhookBody", () => {
  it("produces exactly the documented JSON contract", () => {
    const body = buildWebhookBody("json", "alert.escalated", alert, link, { createdAt: "2026-10-06T14:32:08.000Z", detail: "not in JSON" });
    expect(body).toEqual({
      event: "alert.escalated",
      created_at: "2026-10-06T14:32:08.000Z",
      alert: {
        id: "ALT-7Q2M4K",
        rule_code: "CASH-STRUCT-01",
        typology: "structuring",
        recommendation: "escalate",
        confidence: 0.91,
        risk_score: 82,
        cited_claims: 6,
        url: link,
      },
    });
  });

  it("builds a Slack Block Kit message in the tester's shape", () => {
    const body = buildWebhookBody("slack", "alert.escalated", alert, link, { detail: "Escalated by <Dana> & co." }) as { text: string; blocks: { type: string; [k: string]: unknown }[] };
    expect(body.text).toContain("ALT-7Q2M4K");
    expect(body.blocks.map((b) => b.type)).toEqual(["header", "section", "section", "actions", "context"]);
    expect(body.blocks[0]).toEqual({ type: "header", text: { type: "plain_text", text: "Escalated to L2: ALT-7Q2M4K" } });
    const fields = (body.blocks[1] as unknown as { fields: { text: string }[] }).fields.map((f) => f.text);
    expect(fields).toEqual(["*Typology*\nStructuring", "*Recommendation*\nEscalate", "*Confidence*\n0.91", "*Risk score*\n82 of 100", "*Cited claims*\n6", "*Rule*\nCASH-STRUCT-01"]);
    expect((body.blocks[2] as unknown as { text: { text: string } }).text.text).toBe("Escalated by &lt;Dana&gt; &amp; co.");
    expect(body.blocks[3]).toEqual({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Assay" }, url: link }] });
  });

  it("builds a Teams Adaptive Card message in the tester's shape", () => {
    const body = buildWebhookBody("teams", "sar.decided", alert, link) as {
      type: string;
      attachments: { contentType: string; contentUrl: null; content: { type: string; version: string; body: { type: string }[]; actions: unknown[] } }[];
    };
    expect(body.type).toBe("message");
    expect(body.attachments).toHaveLength(1);
    const a = body.attachments[0];
    expect(a.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(a.contentUrl).toBeNull();
    expect(a.content.type).toBe("AdaptiveCard");
    expect(a.content.version).toBe("1.4");
    expect(a.content.body.map((b) => b.type)).toEqual(["TextBlock", "FactSet", "TextBlock"]);
    expect(a.content.actions).toEqual([{ type: "Action.OpenUrl", title: "Open in Assay", url: link }]);
  });

  it("handles an alert the agent has not run on", () => {
    const body = buildWebhookBody("json", "alert.assigned", { ...alert, recommendation: null, confidence: null, riskScore: null, citedClaims: 0 }, link) as { alert: Record<string, unknown> };
    expect(body.alert.recommendation).toBeNull();
    expect(body.alert.risk_score).toBeNull();
  });
});

describe("signBody", () => {
  it("is sha256= plus the hex HMAC of the raw body", () => {
    const raw = '{"event":"test"}';
    const expected = createHmac("sha256", "whsec_test").update(raw).digest("hex");
    expect(signBody("whsec_test", raw)).toBe(`sha256=${expected}`);
    // RFC 4231 test case 2.
    expect(createHmac("sha256", "Jefe").update("what do ya want for nothing?").digest("hex")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    expect(signBody("Jefe", "what do ya want for nothing?")).toBe("sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });
});

describe("SSRF guard", () => {
  it.each([
    "http://hooks.slack.com/services/x",
    "https://localhost/hook",
    "https://app.localhost/hook",
    "https://127.0.0.1/hook",
    "https://127.9.9.9:8443/hook",
    "https://2130706433/hook", // 127.0.0.1 as a single number
    "https://0x7f.1/hook",
    "https://10.0.0.5/hook",
    "https://172.16.0.1/hook",
    "https://172.31.255.255/hook",
    "https://192.168.1.10/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://0.0.0.0/hook",
    "https://[::1]/hook",
    "https://[::]/hook",
    "https://[fc00::1]/hook",
    "https://[fd12:3456::1]/hook",
    "https://[fe80::1]/hook",
    "https://[::ffff:127.0.0.1]/hook",
    "https://[::ffff:10.1.2.3]/hook",
    "https://user:pass@hooks.example.com/hook",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(validateWebhookUrl(url).ok).toBe(false);
  });

  it.each(["https://hooks.slack.com/services/T000/B000/XXXX", "https://prod-12.westus.logic.azure.com/workflows/abc", "https://172.32.0.1/hook", "https://8.8.8.8/hook", "https://[2606:4700::1111]/hook", "https://hooks.example.com:8443/assay"])(
    "accepts %s",
    (url) => {
      expect(validateWebhookUrl(url)).toMatchObject({ ok: true });
    },
  );

  it("classifies hosts", () => {
    expect(isPrivateHost("LOCALHOST.")).toBe(true);
    expect(isPrivateHost("100.64.0.1")).toBe(true);
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("[2001:db8::1]")).toBe(false);
  });
});

describe("dispatchWebhook", () => {
  let db: DB;
  let wsId: string;
  const ws = async () => (await db.select().from(workspaces).where(eq(workspaces.id, wsId)))[0];

  beforeAll(async () => {
    db = await getDb();
    wsId = await createDemoWorkspace(db);
    await saveWebhookSettings(db, await ws(), { url: "https://93.184.215.14/hooks/assay", format: "json", secret: "whsec_unit", events: ["alert.escalated"] }, "tester");
  });

  it("does nothing without a webhook", async () => {
    const w = await ws();
    const fetchImpl = vi.fn();
    const r = await dispatchWebhook({ ...w, settings: { ...w.settings, webhook: undefined } }, "test", { alert: TEST_ALERT }, { db, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs signed JSON with the event, signature and delivery headers, and audits the delivery", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const r = await dispatchWebhook(await ws(), "alert.escalated", { alert }, { db, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, status: 204 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://93.184.215.14/hooks/assay");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    const h = init.headers as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["X-Assay-Event"]).toBe("alert.escalated");
    expect(h["X-Assay-Delivery"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(h["X-Assay-Signature"]).toBe(signBody("whsec_unit", init.body as string));
    const body = JSON.parse(init.body as string);
    expect(body.event).toBe("alert.escalated");
    expect(body.alert.id).toBe(alert.id);
    expect(body.alert.url).toMatch(/\/app\/alerts\/ALT-7Q2M4K$/);

    const [ev] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.action, "webhook.delivered")));
    expect(ev.payload).toMatchObject({ event: "alert.escalated", status: 204, host: "93.184.215.14", format: "json", deliveryId: h["X-Assay-Delivery"] });
    expect(JSON.stringify(ev.payload)).not.toContain("whsec_unit");
  });

  it("records failures without throwing: non-2xx, redirects and network errors", async () => {
    const w = await ws();
    const r500 = await dispatchWebhook(w, "test", { alert: TEST_ALERT }, { db, fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch });
    expect(r500).toMatchObject({ ok: false, status: 500 });
    const r302 = await dispatchWebhook(w, "test", { alert: TEST_ALERT }, { db, fetchImpl: (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } })) as unknown as typeof fetch });
    expect(r302).toMatchObject({ ok: false, status: 302 });
    const rErr = await dispatchWebhook(w, "test", { alert: TEST_ALERT }, {
      db,
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(rErr).toMatchObject({ ok: false, status: null, error: "fetch failed" });
    const failed = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.workspaceId, wsId), eq(auditEvents.action, "webhook.failed")));
    expect(failed.length).toBe(3);
  });

  it("gives up after the timeout", async () => {
    const slow = ((_: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const r = await dispatchWebhook(await ws(), "test", { alert: TEST_ALERT }, { db, fetchImpl: slow, timeoutMs: 50 });
    expect(r).toMatchObject({ ok: false, status: null, error: "No answer within 5 seconds." });
  });

  it("refuses a stored URL that points inside the network", async () => {
    const w = await ws();
    const fetchImpl = vi.fn();
    const r = await dispatchWebhook({ ...w, settings: { ...w.settings, webhook: { ...w.settings.webhook!, url: "https://10.0.0.8/x" } } }, "test", { alert: TEST_ALERT }, { db, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the webhook when policy changes, and does not bump the version for webhook changes", async () => {
    const before = await ws();
    const { version: _v, webhook: _w, ...policy } = before.settings;
    void _v;
    void _w;
    await updatePolicy(db, before, { ...policy, qaSampleRate: 0.2 }, "tester");
    const after = await ws();
    expect(after.settings.version).toBe(before.settings.version + 1);
    expect(after.settings.qaSampleRate).toBe(0.2);
    expect(after.settings.webhook?.secret).toBe("whsec_unit");

    await saveWebhookSettings(db, after, { ...after.settings.webhook!, format: "slack" }, "tester");
    const again = await ws();
    expect(again.settings.version).toBe(after.settings.version);
    expect(again.settings.webhook?.format).toBe("slack");

    await saveWebhookSettings(db, again, null, "tester");
    const removed = await ws();
    expect(removed.settings.webhook).toBeUndefined();
    expect(removed.settings.version).toBe(after.settings.version);
  });
});
