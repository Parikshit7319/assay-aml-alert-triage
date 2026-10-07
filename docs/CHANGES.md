# The 52 changes

Each item from the October 2026 review, and where it lives in the code.

## Look and feel

| # | Change | Where |
|---|---|---|
| 1 | Full-width product hero: the workbench itself | `src/components/site/HeroRun.tsx`, `hero-run-data.ts`, home page |
| 2 | New type pairing: Source Serif 4 headlines, IBM Plex Sans UI | `src/app/layout.tsx`, `src/app/globals.css` |
| 3 | Varied section layouts: navy bands, splits, ruled lists, figures, diagrams | `src/app/(site)/site.css`, every marketing page |
| 4 | Real product screenshots on marketing pages, captured from the demo | `public/shots/*.png`, `src/components/site/Frame.tsx` |
| 5 | Product page as a seven-chapter scroll story with scroll-spy | `src/app/(site)/product/page.tsx`, `StoryNav.tsx` |
| 6 | Real logo (highlighter-crossbar A) and fixed icon-to-text gap | `src/components/Wordmark.tsx`, `.wordmark` in `globals.css` |
| 7 | Security-print color system with dark navy sections and guilloche linework | `globals.css` tokens, `Guilloche.tsx` |
| 8 | Pricing with usage sliders and the live monthly bill | `src/components/site/UsageCalculator.tsx`, pricing page |
| 9 | Fewer containers: rules and whitespace instead of card grids | `site.css` (`.ruled`, `.figures`, `.jobs`, `.steps`) |
| 10 | Animated agent trace in the hero, citations lighting up records | `HeroRun.tsx` (real `runTriage` output, replayed) |
| 11 | Diagrams: monitoring system to Assay to case manager; policy before and after the model | `src/components/site/diagrams/Architecture.tsx`, `PolicySandwich.tsx` |
| 12 | Favicon and Open Graph image | `src/app/icon.svg`, `src/app/opengraph-image.tsx`, `twitter-image.tsx` |
| 13 | Proper footer | `src/components/site/SiteFooter.tsx` |
| 14 | One icon set | `src/components/viz/Icon.tsx` |

## Copy

| # | Change | Where |
|---|---|---|
| 15 | Outcome- and proof-led copy with sourced numbers | home, product, persona pages |
| 16 | No AI cadence; founder voice | all marketing copy, `/about` |
| 17 | Caveats collapsed into one status block | "Where Assay is today" on the home page (`.status`) |
| 18 | Plain buyer language above the fold | home hero |
| 19 | Persona pages | `/for/bsa-officers`, `/for/analyst-leads`, `/for/model-risk` |
| 20 | First-person About with photo | `/about` |
| 21 | A day in the queue, with before and after numbers | `/day-in-the-queue` |
| 22 | Three posts | `/insights`: FinCEN SAR FAQs, structuring evasion indicators, SR 26-2 controls |

## Functionality

| # | Change | Where |
|---|---|---|
| 23 | Server edition deployable (Vercel plus Neon) | Neon project `assay` created and migrated (all three migrations, journal included); public API live on Neon Functions (`edge/neon-api`); one-click Vercel deploy in `README.md` with derived auth secret, Vercel URL fallbacks and advisory-locked migrations (`src/lib/auth.ts`, `src/lib/db/client.ts`, `src/lib/db/migrate.ts`, `vercel.json`). The Vercel project itself needs the owner's Vercel sign-in. |
| 24 | Bring-your-own-key live model in the demo | `ModelKeyDialog.tsx`, `src/lib/engine/providers/browser.ts`, `use-model-config.ts`; "Use my own key" on every alert |
| 25 | CSV upload in the demo | `src/components/workbench/ImportPanel.tsx`, `src/lib/demo/csv-browser.ts` |
| 26 | Ask the agent, with citations | `src/components/demo/AskAgent.tsx`, `src/lib/ask/*` (demo and server alert pages) |
| 27 | Editable SAR narrative, export to Word and PDF, mapped to FinCEN SAR parts | `src/components/demo/SarEditor.tsx`, `src/lib/exports/sar.ts`, `/app/alerts/[id]/sar` |
| 28 | Transaction timeline and counterparty graph | `src/components/viz/*`, Timeline and Counterparties tabs in `AlertWorkspace.tsx` |
| 29 | Customer view | `Customer360.tsx` (demo), `/app/customers/[id]` (server) |
| 30 | Assignment, per-analyst queues, team workload | `Assignment.tsx`, Owner filter in `QueueFilters.tsx`, `/app/team`, demo Team view |
| 31 | Notes with @mentions and handoff to L2 | `NotesThread.tsx`, `src/app/app/collab-actions.ts`, `alert_notes` table |
| 32 | Search, filters and saved views | `QueueFilters.tsx`, `queue-filter.ts`, wired into `QueueTable.tsx` |
| 33 | Keyboard shortcuts (J/K, Enter, X, C, E, O, A, N, /, g q, ?) | `useHotkeys.ts`, `ShortcutHelp.tsx`, `WorkbenchShell.tsx` |
| 34 | Policy settings in the demo that re-run alerts | `PolicyEditor.tsx`, demo Policy view, versioned in the audit log |
| 35 | Shadow-mode comparison with a confusion matrix | `ShadowView.tsx`, `src/lib/demo/shadow.ts`, `/app/shadow` |
| 36 | Exports: audit log (CSV, verifiable JSON), decisions, QA report, model risk pack | `src/lib/exports/*`, demo Export menu, `/app/export/*` |
| 37 | Demo state saved in the browser, plus Reset | `src/lib/demo/persist.ts`, `DemoPersistence.tsx` |
| 38 | Guided five-step tour | `GuidedTour.tsx`, `tour.ts` |
| 39 | Live queue: new alerts arrive and are triaged | `LiveFeedControl.tsx`, `src/lib/demo/live-feed.ts` |
| 40 | Integrations page and a signed outbound webhook (JSON, Slack, Teams) | `/integrations`, `WebhookTester.tsx`, `src/lib/webhooks.ts`, Webhook section in `/app/settings` |

## Bugs and rough edges

| # | Change | Where |
|---|---|---|
| 41 | Mobile: cards instead of tables, sticky batch bar, nav counts | `QueueCards.tsx` (`BatchBar`), `app.css` breakpoints |
| 42 | Real step timings instead of "1 ms" | measured load timings in `run.ts` and `demo/bundle.ts`, `fmtMs` in `util.ts` |
| 43 | Viewer's local time instead of UTC | `src/components/workbench/Time.tsx` across the workbench |
| 44 | Wrapping fixes ("$4,500.00 a / month", "Cla ude") | `.nowrap`, `.run-meta dd` and `.kv` fixes in `app.css` |
| 45 | No dead ends on the static site | the pilot form posts to the live Neon API (`/api/leads`), sign-up links go to the server origin once set, email fallback only if the API is unreachable |
| 46 | "Code on GitHub" moved to the footer | `SiteFooter.tsx` |
| 47 | Toasts and auto-advance to the next alert | `Toasts.tsx`, "Open the next alert after I decide" in `AlertWorkspace.tsx` |
| 48 | Accessibility pass | axe-core scan (WCAG 2.1 AA, serious and critical) clean on every marketing page and the demo; labels, focus traps, live regions, keyboard paths |

## Trust and go-to-market

| # | Change | Where |
|---|---|---|
| 49 | Security page with a data-flow diagram, encryption, retention, subprocessors, SOC 2 roadmap | `/security`, `diagrams/DataFlow.tsx` |
| 50 | Honest social proof: real product counts and a design partner program, live pilot count only at 3 or more | `DesignPartner.tsx`, `PilotDemand.tsx`, `/api/public/stats` |
| 51 | Custom domain support and first-party analytics | `PAGES_CNAME` repository variable (`build-pages.mjs`, `pages.yml`) switches the site to a custom domain; analytics live via the Neon API (`/api/track`) and `/admin/analytics` on the server edition, no cookies, no IP stored, honors DNT and GPC |
| 52 | 90-second demo video on the home page and a GIF in the README | `public/media/demo.mp4`, `DemoVideo.tsx`, `docs/demo.gif` |
