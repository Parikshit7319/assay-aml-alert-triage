# Assay

An AI first-pass analyst for AML transaction-monitoring alerts. It gathers the evidence, recommends close or escalate with a citation behind every claim, and leaves the decision to a human. Deterministic policy decides what the model is not allowed to do.

"Assay" is a working name. Trademark and domain are not cleared; the name lives in `src/lib/brand.ts`.

## What is in the box

- **Marketing site:** home with a live engine run in the hero, product, governance, pricing, pilot request, API docs, sources.
- **Public demo:** one click creates a private workspace with 44 synthetic alerts across structuring, funnel accounts, high-risk wires, watchlist names, payroll, seasonal cash, thin files and two prompt-injection attempts. It expires after 24 hours.
- **Analyst workbench:** risk-sorted queue with batch approval, alert workspace with clickable citations, L2 investigations with the SAR clock, QA sampling, metrics with the north star and guardrails, hash-chained audit log with export, CSV import, policy versioning and autonomy levels, API keys, plan and usage.
- **Triage engine** (`src/lib/engine`): evidence bundle, deterministic typology checks, pre- and post-model policy, model adapters (Anthropic, OpenAI, Azure OpenAI, plus a deterministic rules model), claim-to-record and dollar-figure validation.
- **Revenue plumbing:** workspaces, plans and entitlements (`src/lib/plans.ts`), per-run usage metering with token and cost tracking, Stripe Checkout, billing portal, webhook, and metered overage via Stripe Billing Meters. REST API at `/api/v1/alerts`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Open the demo**. No database or keys are needed: local mode uses embedded Postgres (PGlite) in `.data/`.

```bash
npm test         # 19 tests: engine, policy, validation, audit chain, workflow
npm run build    # production build
```

## Deploy (fastest path: Vercel + Neon, both have free tiers)

1. Push this folder to a GitHub repository.
2. Create a Postgres database on Neon and copy the pooled connection string.
3. Import the repository in Vercel. Set environment variables:
   - `DATABASE_URL` = the Neon string
   - `BETTER_AUTH_SECRET` = output of `openssl rand -base64 32`
   - `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` = your Vercel URL
4. Deploy. Migrations run on first request (`AUTO_MIGRATE`, default on).
5. Optional: add a Vercel cron hitting `/api/cron/rollup` nightly with header `Authorization: Bearer $CRON_SECRET`.

**Azure instead:** `docker build -t assay .` and run the image on Azure Container Apps with Azure Database for PostgreSQL. Point `AZURE_OPENAI_*` at a deployment in the same subscription.

GitHub Pages cannot host this: it serves static files only, and the product needs a server and a database.

## Turn on billing

1. In Stripe, create a product "Team" with a $1,500 monthly price (`STRIPE_PRICE_TEAM`).
2. Create a Billing Meter with event name `assay_triage_run`, then a metered price on it with graduated tiers: first 2,000 units at $0, then $0.60 (`STRIPE_PRICE_OVERAGE`).
3. Add a webhook to `https://YOUR-DOMAIN/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted` (`STRIPE_WEBHOOK_SECRET`).
4. Set `STRIPE_SECRET_KEY`. The Upgrade button on **Plan and usage** goes live.

## Turn on a live model

Set `ANTHROPIC_API_KEY` (or the OpenAI or Azure OpenAI variables). Then, in a Team-plan workspace, choose the model under **Policy and autonomy**. Demo and Sandbox workspaces always use the rules model. Every run records which model ran, its tokens and its cost.

## Honest status

- Working software, with no customers yet and no production data processed.
- Performance numbers are modeled and labeled. The demo's weekly history is synthetic.
- No SOC 2 report, independent model validation or penetration test yet.
- Pricing is a hypothesis to test with design partners.
- Before taking real money: form a legal entity, have a lawyer review the privacy and terms pages, and sign a data processing agreement with each pilot customer.

## Layout

```
src/lib/engine      triage pipeline, detectors, policy, validation, model adapters
src/lib/demo        synthetic scenarios, seeding, synthetic metric history
src/lib/workflow.ts analyst actions (L1, batch, L2, SAR, QA, policy)
src/lib/audit.ts    hash-chained audit log
src/lib/metering.ts usage, plan limits
src/lib/billing     Stripe
src/app/(site)      public site
src/app/app         workbench
src/app/api         auth, REST API, Stripe webhook, cron, health
test/               vitest suites
```
