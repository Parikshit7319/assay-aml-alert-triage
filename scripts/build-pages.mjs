// Builds the static GitHub Pages edition: the marketing site plus the in-browser demo.
// Server-only routes (workbench, API, auth) are removed from a temporary copy, the
// demo button and pilot form are swapped for static versions, and Next exports to ./out.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const tmp = path.join(path.dirname(root), `${path.basename(root)}-pages-build`);
const basePath = process.env.PAGES_BASE_PATH ?? "/assay-aml-alert-triage";
const siteUrl = process.env.PAGES_SITE_URL ?? `https://parikshit7319.github.io${basePath}`;
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
for (const p of ["src/app/app", "src/app/api", "src/app/admin", "src/app/(site)/sign-in", "src/app/(site)/sign-up", "src/app/(site)/auth-actions.ts", "src/app/demo-action.ts", "src/components/AuthForms.tsx", "src/components/app/BillingButtons.tsx", "src/components/app/ApiKeyForms.tsx", "src/components/app/PolicyForm.tsx", "src/components/app/RenameForm.tsx", "src/components/app/ImportForm.tsx", "src/components/app/QaForm.tsx", "src/components/app/TriageQueueButton.tsx", "test"]) rm(p);
mv("src/components/DemoButton.static.tsx", "src/components/DemoButton.tsx");
mv("src/components/PilotForm.static.tsx", "src/components/PilotForm.tsx");

writeFileSync(
  path.join(tmp, "next.config.ts"),
  `import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", basePath: ${JSON.stringify(basePath)}, trailingSlash: true, images: { unoptimized: true }, turbopack: { root: ${JSON.stringify(path.dirname(root))} } };
export default nextConfig;
`,
);

execSync("npx next build", {
  cwd: tmp,
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_STATIC: "1", NEXT_PUBLIC_APP_URL: siteUrl, NEXT_TELEMETRY_DISABLED: "1" },
});

rmSync(path.join(root, "out"), { recursive: true, force: true });
cpSync(path.join(tmp, "out"), path.join(root, "out"), { recursive: true });
writeFileSync(path.join(root, "out/.nojekyll"), "");
if (!existsSync(path.join(root, "out/index.html"))) throw new Error("Static export produced no index.html");
console.log(`\nStatic site in ./out, served at ${siteUrl}/`);
