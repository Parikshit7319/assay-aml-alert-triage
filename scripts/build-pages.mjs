// Builds the static GitHub Pages edition: the marketing site plus the in-browser demo.
// Server-only routes (workbench, API, auth) are removed from a temporary copy, the
// demo button and pilot form are swapped for static versions, and Next exports to ./out.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const tmp = path.join(path.dirname(root), `${path.basename(root)}-pages-build`);
// A custom domain (PAGES_CNAME) serves the site from the root; otherwise it lives under /<repo>.
const cname = (process.env.PAGES_CNAME || "").trim();
const basePath = cname ? "" : process.env.PAGES_BASE_PATH || "/assay-aml-alert-triage";
const siteUrl = cname ? `https://${cname}` : process.env.PAGES_SITE_URL || `https://parikshit7319.github.io${basePath}`;
const skip = new Set(["node_modules", ".next", ".git", ".data", "out", ".pages-build"]);

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp);
cpSync(root, tmp, { recursive: true, filter: (src) => !skip.has(path.relative(root, src).split(path.sep)[0]) });
symlinkSync(path.join(root, "node_modules"), path.join(tmp, "node_modules"), "dir");

const rm = (p) => rmSync(path.join(tmp, p), { recursive: true, force: true });
const mv = (from, to) => {
  cpSync(path.join(tmp, from), path.join(tmp, to));
  rm(from);
};

cpSync(path.join(tmp, "src/app/app/app.css"), path.join(tmp, "src/app/demo/app.css"));
const demoPage = path.join(tmp, "src/app/demo/page.tsx");
writeFileSync(demoPage, readFileSync(demoPage, "utf8").replace('"../app/app.css"', '"./app.css"'));
for (const p of ["src/app/app", "src/app/api", "src/app/admin", "src/app/(site)/sign-in", "src/app/(site)/sign-up", "src/app/(site)/auth-actions.ts", "src/app/demo-action.ts", "src/components/AuthForms.tsx", "src/components/app/BillingButtons.tsx", "src/components/app/ApiKeyForms.tsx", "src/components/app/PolicyForm.tsx", "src/components/app/RenameForm.tsx", "src/components/app/ImportForm.tsx", "src/components/app/QaForm.tsx", "src/components/app/TriageQueueButton.tsx", "src/components/app/WebhookForm.tsx", "vercel.json", "test"]) rm(p);
mv("src/components/DemoButton.static.tsx", "src/components/DemoButton.tsx");
mv("src/components/PilotForm.static.tsx", "src/components/PilotForm.tsx");

writeFileSync(
  path.join(tmp, "next.config.ts"),
  `import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", basePath: ${JSON.stringify(basePath)}, trailingSlash: true, images: { unoptimized: true }, turbopack: { root: ${JSON.stringify(path.dirname(root))} } };
export default nextConfig;
`,
);

// Where the static pages send forms, analytics and sign-ups: the deployed server edition, when there is one.
// Passed through from the environment unchanged; empty means the static fallbacks (mailto form, no analytics).
const passthrough = Object.fromEntries(["NEXT_PUBLIC_APP_ORIGIN", "NEXT_PUBLIC_API_BASE"].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
for (const k of ["NEXT_PUBLIC_APP_ORIGIN", "NEXT_PUBLIC_API_BASE"]) if (!process.env[k]) delete process.env[k];
console.log(
  Object.keys(passthrough).length
    ? `Static build talks to: ${Object.entries(passthrough).map(([k, v]) => `${k}=${v}`).join(", ")}`
    : "Static build has no server: NEXT_PUBLIC_APP_ORIGIN and NEXT_PUBLIC_API_BASE are unset, so the pilot form falls back to email.",
);

execSync("npx next build", {
  cwd: tmp,
  stdio: "inherit",
  env: {
    ...process.env,
    ...passthrough,
    NEXT_PUBLIC_STATIC: "1",
    NEXT_PUBLIC_APP_URL: siteUrl,
    // withBase() prefixes raw <img>/<video> sources with this, matching next.config's basePath.
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});

rmSync(path.join(root, "out"), { recursive: true, force: true });
cpSync(path.join(tmp, "out"), path.join(root, "out"), { recursive: true });
writeFileSync(path.join(root, "out/.nojekyll"), "");
if (!existsSync(path.join(root, "out/index.html"))) throw new Error("Static export produced no index.html");

// GitHub Pages picks the content type from the extension, so give the generated social images one
// and point every page's meta tags at the renamed files.
const renames = [
  ["opengraph-image", "og.png"],
  ["twitter-image", "og-twitter.png"],
];
for (const [from, to] of renames) {
  const src = path.join(root, "out", from);
  if (existsSync(src)) cpSync(src, path.join(root, "out", to));
}
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
let patched = 0;
for (const f of walk(path.join(root, "out")).filter((f) => f.endsWith(".html") || f.endsWith(".txt"))) {
  const before = readFileSync(f, "utf8");
  const after = before.replace(/\/(opengraph-image|twitter-image)(\?[A-Za-z0-9_-]+)?(?=["'\\])/g, (_m, name) => `/${name === "opengraph-image" ? "og.png" : "og-twitter.png"}`);
  if (after !== before) {
    writeFileSync(f, after);
    patched++;
  }
}
console.log(`Social image tags pointed at og.png in ${patched} files.`);

// Optional custom domain for GitHub Pages: PAGES_CNAME=assay.example.com writes out/CNAME.
if (cname) writeFileSync(path.join(root, "out/CNAME"), `${cname}\n`);
console.log(`\nStatic site in ./out, served at ${siteUrl}/`);
