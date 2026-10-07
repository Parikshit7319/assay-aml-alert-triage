import "@/app/(site)/content.css";

/*
 * Security data-flow diagram. Inline SVG, styled by classes in content.css so it
 * follows the site tokens. Numbered arrows match the legend list underneath,
 * which doubles as the text alternative.
 */

const W = 1120;
const H = 560;

function Box({ x, y, w, h, title, lines, variant }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; variant?: "key" | "chain" }) {
  return (
    <g>
      <rect className={`c-df__box${variant ? ` c-df__box--${variant}` : ""}`} x={x} y={y} width={w} height={h} rx={8} />
      <text className="c-df__t" x={x + 16} y={y + 28}>
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} className="c-df__s" x={x + 16} y={y + 52 + i * 19}>
          {l}
        </text>
      ))}
    </g>
  );
}

function Num({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="c-df__n">
      <circle cx={x} cy={y} r={12} />
      <text x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

export const DATA_FLOW_STEPS: { title: string; body: string }[] = [
  { title: "Alerts in.", body: "Your monitoring system sends alerts with the customer profile, transactions and prior cases, by CSV upload or the REST API, over HTTPS." },
  { title: "People in.", body: "Analysts and reviewers use the workbench in a browser over HTTPS. Enterprise signs in through Microsoft Entra ID." },
  { title: "Model call.", body: "The app sends one alert's evidence bundle to the model provider your workspace chose, with customer-written text tagged as untrusted. Instruction-like text is never sent; the alert locks instead." },
  { title: "Storage.", body: "Alerts, runs, decisions and QA reviews live in Postgres, encrypted at rest by the managed database provider." },
  { title: "Audit.", body: "Every run, decision and policy change is appended to a SHA-256 hash chain. An edit anywhere breaks every hash after it." },
  { title: "Events out.", body: "Escalations and other events go to your endpoint, Slack or Microsoft Teams, signed with HMAC-SHA256 over the raw body." },
];

export function DataFlow() {
  return (
    <figure className="c-df">
      <div className="diagram-scroll c-df__scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="c-df-title c-df-desc">
          <title id="c-df-title">Assay data flow</title>
          <desc id="c-df-desc">
            Your monitoring system and your analysts connect to the Assay app over HTTPS. The app calls one model provider, stores records in encrypted Postgres, writes a hash-chained audit log, and sends signed webhooks to your systems. The numbered steps are
            described in the list below the diagram.
          </desc>
          <defs>
            <marker id="c-df-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="c-df__head" d="M0 0L10 5L0 10z" />
            </marker>
          </defs>

          {/* Your side, left */}
          <rect className="c-df__ext" x={8} y={30} width={270} height={500} rx={12} />
          <text className="c-df__zt" x={24} y={54}>
            Your bank
          </text>
          <Box x={24} y={76} w={238} h={128} title="Monitoring system" lines={["Alerts and rule codes", "Customer profile, transactions", "Prior alerts and SARs"]} />
          <Box x={24} y={330} w={238} h={108} title="Analysts and reviewers" lines={["Browser, HTTPS", "Entra ID SSO on Enterprise"]} />

          {/* Assay zone, middle */}
          <rect className="c-df__zone" x={330} y={30} width={470} height={500} rx={12} />
          <text className="c-df__zt" x={346} y={54}>
            Assay deployment
          </text>
          <text className="c-df__s" x={346} y={74}>
            Hosted region, or your own Azure subscription on Enterprise
          </text>
          <Box x={354} y={96} w={422} h={150} variant="key" title="Assay app" lines={["Evidence bundle and policy rules P1 to P6", "Citation and dollar-figure validation", "Roles: owner, admin, analyst, reviewer", "Queries scoped to one workspace"]} />
          <Box x={354} y={330} w={200} h={128} title="Postgres" lines={["Alerts, runs, decisions", "Encrypted at rest by", "the managed provider"]} />
          <Box x={576} y={330} w={200} h={128} variant="chain" title="Audit log" lines={["SHA-256 hash chain", "Each row hashes the", "previous row's hash"]} />

          {/* Their side, right */}
          <rect className="c-df__ext" x={842} y={30} width={270} height={500} rx={12} />
          <text className="c-df__zt" x={858} y={54}>
            Services you choose
          </text>
          <Box x={858} y={76} w={238} h={148} title="Model provider" lines={["Anthropic, OpenAI or", "Azure OpenAI", "Your key, or your own", "Azure endpoint"]} />
          <Box x={858} y={330} w={238} h={128} title="Your endpoint or chat" lines={["JSON, Slack or Teams", "X-Assay-Signature:", "HMAC-SHA256"]} />

          {/* 1: monitoring system to app */}
          <path className="c-df__line" d="M262 140H350" markerEnd="url(#c-df-arrow)" />
          <Num x={306} y={140} n={1} />
          {/* 2: analysts to app */}
          <path className="c-df__line" d="M262 384H306V214H350" markerEnd="url(#c-df-arrow)" markerStart="url(#c-df-arrow)" />
          <Num x={306} y={300} n={2} />
          {/* 3: app to model and back */}
          <path className="c-df__line" d="M776 132H854" markerEnd="url(#c-df-arrow)" />
          <path className="c-df__line c-df__line--dash" d="M854 176H780" markerEnd="url(#c-df-arrow)" />
          <Num x={816} y={154} n={3} />
          {/* 4: app to Postgres */}
          <path className="c-df__line" d="M454 246V326" markerEnd="url(#c-df-arrow)" />
          <Num x={454} y={288} n={4} />
          {/* 5: app to audit log */}
          <path className="c-df__line" d="M676 246V326" markerEnd="url(#c-df-arrow)" />
          <Num x={676} y={288} n={5} />
          {/* 6: app to your endpoint */}
          <path className="c-df__line" d="M776 220H820V394H854" markerEnd="url(#c-df-arrow)" />
          <Num x={820} y={300} n={6} />

          <text className="c-df__s" x={346} y={500}>
            Nothing in this zone trains a model on your data.
          </text>
        </svg>
      </div>
      <ol className="c-df__legend">
        {DATA_FLOW_STEPS.map((s) => (
          <li key={s.title}>
            <b>{s.title}</b> {s.body}
          </li>
        ))}
      </ol>
    </figure>
  );
}
