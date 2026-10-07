import { describe, expect, it } from "vitest";
import { auditToCsv, auditToJson, csvField, decisionsToCsv, qaToCsv, toCsv } from "@/lib/exports/csv";
import { buildModelRiskPack, MODEL_RISK_SECTIONS, type ModelRiskPackInput } from "@/lib/exports/model-risk";
import { buildSarDraft, SAR_DISCLAIMER, SAR_NARRATIVE_LIMIT, sarToDocx, sarToPrintHtml, suggestCategories, type SarDraftInput } from "@/lib/exports/sar";

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks per RFC 4180", () => {
    const csv = toCsv([{ a: "plain", b: "x,y", c: 'say "hi"', d: "line1\nline2", e: null, f: 42, g: true }]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("a,b,c,d,e,f,g");
    expect(row).toBe('plain,"x,y","say ""hi""","line1\nline2",,42,true');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("uses the given column order and fills missing keys", () => {
    expect(toCsv([{ b: 2, a: 1 }, { a: 3 }], ["a", "b"])).toBe("a,b\r\n1,2\r\n3,\r\n");
  });

  it("collects columns in first-seen order when none are given", () => {
    expect(toCsv([{ a: 1 }, { b: 2, a: 3 }])).toBe("a,b\r\n1,\r\n3,2\r\n");
  });

  it("guards string cells against spreadsheet formulas but leaves numbers alone", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField(-5)).toBe("-5");
    expect(csvField("=1+1", { formulaGuard: false })).toBe("=1+1");
    expect(csvField("=a,b")).toBe(`"'=a,b"`);
  });

  it("serialises dates and objects", () => {
    expect(csvField(new Date("2026-10-03T15:00:00Z"))).toBe("2026-10-03T15:00:00.000Z");
    expect(csvField({ k: "v" })).toBe('"{""k"":""v""}"');
  });

  it("exports audit, QA and decision rows", () => {
    const ev = { seq: 1, ts: "2026-10-03T15:00:00Z", actorType: "agent", actorName: "triage-agent", action: "agent.triage_completed", entityType: "alert", entityId: "ALT-1", payload: { a: 1 }, prevHash: "0", hash: "abc" };
    const audit = auditToCsv([ev]);
    expect(audit.split("\r\n")[0]).toBe("seq,ts,actor_type,actor_name,action,entity_type,entity_id,payload,prev_hash,hash");
    expect(audit).toContain('"{""a"":1}"');
    const json = JSON.parse(auditToJson([ev], { workspaceName: "Demo", exportedAt: "2026-10-04T00:00:00Z" }));
    expect(json).toMatchObject({ format: "assay.audit.v1", workspaceName: "Demo", eventCount: 1, exportedAt: "2026-10-04T00:00:00Z" });
    expect(json.events[0].ts).toBe("2026-10-03T15:00:00.000Z");

    const qa = qaToCsv([{ alertId: "ALT-1", typology: "structuring", sampledAt: "2026-10-01T00:00:00Z", result: null }]);
    expect(qa).toContain("pending");
    const dec = decisionsToCsv([{ alertId: "ALT-1", actorType: "human", actorName: "Ana", action: "override_to_close", agreedWithAgent: false, createdAt: "2026-10-01T00:00:00Z" }]);
    expect(dec).toContain("Overrode to close");
    expect(dec).toContain(",no,");
  });
});

const base: SarDraftInput = {
  alertId: "ALT-TEST01",
  ruleCode: "CASH-STRUCT-01",
  ruleDescription: "Multiple cash deposits just under $10,000",
  typology: "structuring",
  createdAt: "2026-09-20T12:00:00Z",
  customer: { id: "KYC-1", name: "Daniel R. Ortiz", kind: "individual", occupation: "Restaurant manager", country: "US", onboardedAt: "2021-03-02T00:00:00Z" },
  transactions: [
    { id: "TXN-3", ts: "2026-09-14T16:00:00Z", amountCents: 990_000, direction: "in", channel: "cash", counterpartyName: null, counterpartyCountry: null, branch: "Midtown" },
    { id: "TXN-1", ts: "2026-09-02T15:00:00Z", amountCents: 940_000, direction: "in", channel: "cash", counterpartyName: null, counterpartyCountry: null, branch: "Heights" },
    { id: "TXN-2", ts: "2026-09-08T15:00:00Z", amountCents: 960_000, direction: "in", channel: "cash", counterpartyName: null, counterpartyCountry: null, branch: "Midtown" },
    { id: "TXN-9", ts: "2026-07-01T15:00:00Z", amountCents: 120_000, direction: "out", channel: "ach", counterpartyName: "Landlord LLC", counterpartyCountry: "US", branch: null },
  ],
  citedIds: ["TXN-1", "TXN-2", "TXN-3", "KYC-1"],
  rationale: [{ claim: "Three cash deposits between $9,400 and $9,900 at two branches.", citations: ["TXN-1", "TXN-2", "TXN-3"] }],
  narrative: "First paragraph.\n\nSecond paragraph.",
  institution: { name: "First Example Bank", contact: "BSA Office, 555-0100" },
};

describe("buildSarDraft", () => {
  const draft = buildSarDraft(base, { preparedAt: "2026-10-03T15:00:00Z" });

  it("computes the date range and total from cited transactions only", () => {
    expect(draft.activity.dateRange).toEqual({ start: "09/02/2026", end: "09/14/2026", display: "09/02/2026 to 09/14/2026" });
    expect(draft.activity.transactionCount).toBe(3);
    expect(draft.activity.totalAmountCents).toBe(2_890_000);
    expect(draft.activity.wholeDollars).toBe(28_900);
    expect(draft.activity.inflowCents).toBe(2_890_000);
    expect(draft.activity.transactions.map((t) => t.id)).toEqual(["TXN-1", "TXN-2", "TXN-3"]);
    expect(draft.institution.locations).toEqual(["Heights", "Midtown"]);
  });

  it("maps typologies to suggested FinCEN categories", () => {
    expect(draft.activity.categories).toEqual([{ category: "Structuring", subtype: "Transaction(s) below CTR threshold" }]);
    expect(suggestCategories("funnel_account")[0]).toMatchObject({ category: "Money laundering", subtype: "Funnel account" });
    expect(suggestCategories("high_risk_wire")[0].category).toBe("Other suspicious activities");
    expect(suggestCategories("sanctions_name")[0].note).toMatch(/OFAC/);
    expect(suggestCategories("payroll_pattern")[0].category).toBe("Other suspicious activities");
  });

  it("orders parts I to V and carries the disclaimer", () => {
    expect(draft.parts.map((p) => p.number)).toEqual(["I", "II", "III", "IV", "V"]);
    expect(draft.disclaimer).toBe(SAR_DISCLAIMER);
    expect(draft.status).toBe("draft");
    expect(draft.subject.lastOrEntityName).toBe("Ortiz");
    expect(draft.subject.firstName).toBe("Daniel R.");
    expect(draft.narrative.paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("warns about long narratives, missing subject fields and no citations", () => {
    expect(draft.warnings.some((w) => /over the/.test(w))).toBe(false);
    const long = buildSarDraft({ ...base, narrative: "x".repeat(SAR_NARRATIVE_LIMIT + 5) });
    expect(long.narrative.overLimit).toBe(true);
    expect(long.warnings.some((w) => w.includes("5 over the 17,000 character limit"))).toBe(true);

    const sparse = buildSarDraft({ ...base, customer: { ...base.customer, occupation: null, onboardedAt: null }, citedIds: [] });
    expect(sparse.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/occupation is missing/), expect.stringMatching(/onboarding date is missing/), expect.stringMatching(/No cited transactions/)]),
    );
    expect(sparse.activity.dateRange).toBeNull();
    expect(sparse.activity.totalAmountCents).toBe(0);

    const sanctions = buildSarDraft({ ...base, typology: "sanctions_name" });
    expect(sanctions.warnings.some((w) => w.includes("OFAC"))).toBe(true);
  });

  it("renders print HTML with every part, escaped text and the draft marker", () => {
    const html = sarToPrintHtml(buildSarDraft({ ...base, narrative: "<script>alert(1)</script>" }));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const t of ["Subject information", "Suspicious activity information", "Financial institution where activity occurred", "Filing institution contact information", "Narrative"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("DRAFT");
    expect(html).toContain("ALT-TEST01");
    expect(html).toContain("Assay never files SARs.");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/\u2014/);
  });

  it("builds a Word document", async () => {
    const blob = await sarToDocx(draft);
    expect(blob.size).toBeGreaterThan(5000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("uses no em dashes in user-facing text", () => {
    const all = JSON.stringify(draft) + JSON.stringify(buildSarDraft({ ...base, citedIds: [], narrative: "" }));
    expect(all).not.toMatch(/\u2014/);
  });
});

describe("buildModelRiskPack", () => {
  const input: ModelRiskPackInput = {
    workspaceName: "Demo workspace",
    generatedAt: "2026-10-03T15:00:00Z",
    policy: {
      version: 3,
      autonomy: { structuring: 1, funnel_account: 1, high_risk_wire: 1, sanctions_name: 1, payroll_pattern: 2, seasonal_cash: 2, other: 0 },
      closeConfidenceFloor: 0.85,
      autoCloseConfidenceFloor: 0.95,
      watchlistForceL2Similarity: 0.88,
      minTransactionsForDecision: 8,
      qaSampleRate: 0.1,
      provider: "simulated",
    },
    model: { provider: "simulated", model: "assay-sim-1" },
    runStats: { runs: 120, completed: 104, locked: 9, abstained: 7, citationValidRate: 0.981, avgCostUsd: 0.0123 },
    typologyStats: [
      { typology: "structuring", alerts: 40, qaSampled: 12, qaAgreement: 0.9166, shadowAgreement: null },
      { typology: "payroll_pattern", alerts: 30, qaSampled: 9, qaAgreement: 1, shadowAgreement: 0.97 },
    ],
  };
  const html = buildModelRiskPack(input);

  it("contains the title and every section heading", () => {
    expect(html).toContain("<title>Model risk documentation pack");
    expect(html).toContain("<h1>Model risk documentation pack</h1>");
    expect(MODEL_RISK_SECTIONS).toHaveLength(9);
    MODEL_RISK_SECTIONS.forEach((s, i) => expect(html).toContain(`<span class="no">${i + 1}</span>${s}</h2>`));
  });

  it("shows live thresholds, regulatory context and sign-off roles", () => {
    expect(html).toContain("SR 26-2");
    expect(html).toContain("OCC Bulletin 2026-13");
    expect(html).toContain("85%");
    expect(html).toContain("0.88");
    expect(html).toContain("98.1%");
    expect(html).toContain("Not enough data");
    for (const role of ["Model owner", "BSA officer", "Model risk"]) expect(html).toContain(`<td>${role}</td>`);
    expect(html).toContain("Clearing a sanctions or watchlist match");
    expect(html).not.toMatch(/\u2014/);
  });
});
