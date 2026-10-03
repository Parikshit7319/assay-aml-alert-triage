// QA walkthrough: opens the demo and screenshots the main screens.
// Usage: node scripts/flow.mjs http://localhost:3100 /tmp/shots [width]
import { chromium } from "playwright";

const [, , base = "http://localhost:3100", out = "/tmp/shots", width = "1440"] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, full = true) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  console.log("shot", name, page.url());
};

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Open the demo" }).first().click();
await page.waitForURL("**/app", { timeout: 60000 });
await shot("queue");

const hero = page.locator("a.row-link").first();
await hero.click();
await page.waitForURL("**/app/alerts/**");
await page.locator(".claims .stamp").first().click();
await shot("alert");

for (const p of ["metrics", "qa", "l2"]) {
  await page.goto(`${base}/app/${p}`, { waitUntil: "networkidle" });
  await shot(p);
}
if (errors.length) console.log("ERRORS\n" + errors.join("\n"));
await browser.close();
