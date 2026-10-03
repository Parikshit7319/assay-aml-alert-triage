import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3200";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const p = await b.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base + "/sign-up");
await p.fill('input[name="name"]', "Test Analyst");
await p.fill('input[name="company"]', "Test Fintech");
await p.fill('input[name="email"]', `t${Date.now()}@example.com`);
await p.fill('input[name="password"]', "correct-horse-battery");
await p.click('button:has-text("Create account")');
await p.waitForURL(/\/app/, { timeout: 30000 }); await p.waitForTimeout(1500); console.log("landed:", p.url(), "|", (await p.locator("h1").first().innerText()), "|", await p.locator(".app-side__ws").innerText().catch(()=>"no ws")); await p.goto(base + "/app/import");
const csv = await (await fetch(base + "/app/import/template")).text();
await p.setInputFiles('input[type="file"]', { name: "t.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await p.click('button:has-text("Import and triage")');
await p.waitForSelector(".form-ok, .form-error", { timeout: 30000 });
console.log("import:", await p.locator(".form-ok, .form-error").first().innerText());
for (const path of ["/app", "/app/settings", "/app/billing", "/app/developers", "/app/audit"]) {
  const r = await p.goto(base + path); console.log(r.status(), path);
}
await p.goto(base + "/app");
console.log("queue rows:", await p.locator("a.row-link").count(), "| recs:", (await p.locator("td .rec").allInnerTexts()).join(", "));
if (errs.length) console.log("ERRORS", errs);
await b.close();
