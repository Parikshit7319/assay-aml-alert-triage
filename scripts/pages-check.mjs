import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3300/assay-aml-alert-triage/";
const out = process.argv[3] ?? "/tmp/shots";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForTimeout(3500);
await p.screenshot({ path: `${out}/pages-home.png` });
await p.getByRole("link", { name: /live demo/i }).first().click();
await p.waitForSelector("a.row-link", { timeout: 30000 });
await p.waitForTimeout(1200);
await p.keyboard.press("Escape"); // first visit opens the guided tour
console.log("demo url", p.url(), "rows", await p.locator("a.row-link").count());
await p.screenshot({ path: `${out}/pages-queue.png` });
await p.locator("a.row-link").first().click();
await p.waitForSelector(".claims .stamp");
await p.locator(".claims .stamp").first().click();
await p.click('button:has-text("Accept escalation")');
await p.waitForSelector("text=L2 investigation", { timeout: 10000 });
console.log("decision: escalated, L2 panel shown");
await p.screenshot({ path: `${out}/pages-alert.png`, fullPage: true });
for (const n of ["Metrics", "Audit log", "QA review", "L2 investigations"]) {
  await p.getByRole("link", { name: n }).first().click(); await p.waitForTimeout(600);
  console.log(n, "ok:", (await p.locator("h1").first().innerText()));
}
await p.getByRole("link", { name: "Audit log" }).first().click(); await p.waitForTimeout(800);
console.log("audit:", await p.locator(".chain").innerText());
for (const path of ["product/", "governance/", "pricing/", "pilot/", "about/", "sources/", "developers/", "privacy/"]) {
  const r = await p.goto(base + path); console.log(r.status(), path);
}
if (errs.length) console.log("ERRORS", errs.slice(0, 5));
await b.close();
