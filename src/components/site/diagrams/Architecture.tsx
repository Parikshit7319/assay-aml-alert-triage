import { DEFAULT_POLICY } from "@/lib/engine/policy";
import "../marketing.css";

/*
 * Where Assay sits: your monitoring system on the left sends alerts in, the run
 * goes left to right through the five stages, drops into the analyst
 * workbench, and the result goes back to your own systems. Hand-built SVG,
 * styled by m-arch classes in marketing.css so it follows the site tokens.
 * The numbered markers match the five captions the page renders under it.
 */

const W = 1200;
const H = 480;
const STAGE_Y = 92;
const STAGE_H = 124;
const STAGE_W = 178;
const STAGE_GAP = 14;
const STAGE_X0 = 236;
const MID = STAGE_Y + STAGE_H / 2;
const BENCH_Y = 296;
const BENCH_H = 104;

const floor = DEFAULT_POLICY.closeConfidenceFloor.toFixed(2);
const wl = DEFAULT_POLICY.watchlistForceL2Similarity.toFixed(2);

const STAGES: { title: string; lines: string[]; model?: boolean }[] = [
  { title: "Evidence", lines: ["Profile and staff notes", "90 days plus 3 years", "Prior alerts and SARs"] },
  { title: "Rules before", lines: [`Watchlist ${wl}+: to L2`, "Injected text: locked", "Thin file: abstain"] },
  { title: "Model", lines: ["Reads the evidence", "Recommends and scores", "Cites every claim"], model: true },
  { title: "Checks", lines: ["Citations resolve", "Dollar figures trace", "Failures go to a person"] },
  { title: "Rules after", lines: [`Close under ${floor}: review`, "Autonomy per alert type", "Auto-close only at L3"] },
];

const sx = (i: number) => STAGE_X0 + i * (STAGE_W + STAGE_GAP);

function Num({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="m-arch__num">
      <circle cx={x} cy={y} r={11} />
      <text x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

function Lines({ x, y, lines, cls = "m-arch__s", step = 18 }: { x: number; y: number; lines: string[]; cls?: string; step?: number }) {
  return (
    <>
      {lines.map((l, i) => (
        <text key={l} className={cls} x={x} y={y + i * step}>
          {l}
        </text>
      ))}
    </>
  );
}

export function Architecture({ caption = true }: { caption?: boolean }) {
  const s5 = sx(4) + STAGE_W / 2;
  const s2 = sx(1) + STAGE_W / 2;
  return (
    <figure className="diagram m-arch">
      <div className="diagram-scroll m-arch__scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="m-arch-title m-arch-desc">
          <title id="m-arch-title">Where Assay sits between your monitoring system and your case manager</title>
          <desc id="m-arch-desc">
            Your transaction monitoring system sends alerts to Assay by CSV or the REST API. Each alert runs through five stages in order: evidence gathering, rules before the model, the model, checks on the
            model&apos;s citations and dollar figures, and rules after the model. Alerts locked by the rules before the model skip the model and go straight to a person. Results land in the analyst workbench,
            where L1 decides, L2 investigates and QA reviews a sample. Decisions go back to your case manager by API and events to Slack, Teams or your endpoint by signed webhook. SARs are filed by your team in
            BSA E-Filing. Every run, decision and policy change is written to a hash-chained audit log.
          </desc>
          <defs>
            <marker id="m-arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="m-arch__head" d="M0 0L10 5L0 10z" />
            </marker>
            <marker id="m-arch-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="m-arch__head--red" d="M0 0L10 5L0 10z" />
            </marker>
          </defs>

          {/* Your systems, left */}
          <text className="m-arch__zt m-arch__zt--ext" x={0} y={54}>
            Your systems
          </text>
          <rect className="m-arch__box" x={0} y={STAGE_Y} width={176} height={STAGE_H} rx={8} />
          <Lines x={14} y={STAGE_Y + 26} lines={["Transaction", "monitoring"]} cls="m-arch__t" step={18} />
          <Lines x={14} y={STAGE_Y + 70} lines={["Actimize, Verafin or", "in-house rules"]} step={17} />

          <rect className="m-arch__box" x={0} y={BENCH_Y} width={176} height={92} rx={8} />
          <text className="m-arch__t" x={14} y={BENCH_Y + 26}>
            Case manager
          </text>
          <Lines x={14} y={BENCH_Y + 48} lines={["Decisions back by API", "SARs filed by you in", "BSA E-Filing"]} step={16} />

          <rect className="m-arch__box" x={0} y={BENCH_Y + 108} width={176} height={60} rx={8} />
          <text className="m-arch__t" x={14} y={BENCH_Y + 132}>
            Slack, Teams, or
          </text>
          <text className="m-arch__s" x={14} y={BENCH_Y + 151}>
            your endpoint, signed
          </text>

          {/* Assay zone */}
          <rect className="m-arch__zone" x={216} y={24} width={W - 217} height={H - 30} rx={14} />
          <text className="m-arch__zt" x={236} y={54}>
            Assay
          </text>
          <text className="m-arch__s" x={286} y={54}>
            Hosted, or single-tenant in your Azure subscription
          </text>

          {/* Evidence path: the highlighter runs under the whole run */}
          <path className="m-arch__evidence" d={`M176 ${MID}H${s5}V${BENCH_Y}`} />

          {/* 1: alerts in */}
          <path className="m-arch__line" d={`M176 ${MID}H${STAGE_X0 - 2}`} markerEnd="url(#m-arch-arrow)" />
          <Num x={204} y={MID - 26} n={1} />

          {/* Stages */}
          {STAGES.map((st, i) => (
            <g key={st.title}>
              <rect className={st.model ? "m-arch__box m-arch__box--model" : "m-arch__box"} x={sx(i)} y={STAGE_Y} width={STAGE_W} height={STAGE_H} rx={8} />
              <text className={st.model ? "m-arch__t m-arch__t--model" : "m-arch__t"} x={sx(i) + 14} y={STAGE_Y + 28}>
                {st.title}
              </text>
              <Lines x={sx(i) + 14} y={STAGE_Y + 56} lines={st.lines} cls={st.model ? "m-arch__s m-arch__s--model" : "m-arch__s"} />
              {i < STAGES.length - 1 && <path className="m-arch__line" d={`M${sx(i) + STAGE_W} ${MID}H${sx(i + 1) - 1}`} markerEnd="url(#m-arch-arrow)" />}
            </g>
          ))}
          <Num x={sx(0) + STAGE_W / 2} y={STAGE_Y - 14} n={2} />
          <path className="m-arch__bracket" d={`M${sx(1)} ${STAGE_Y - 8}V${STAGE_Y - 14}H${sx(4) + STAGE_W}V${STAGE_Y - 8}`} />
          <Num x={(sx(1) + sx(4) + STAGE_W) / 2} y={STAGE_Y - 14} n={3} />

          {/* Locked alerts skip the model */}
          <path className="m-arch__line m-arch__line--red" d={`M${s2} ${STAGE_Y + STAGE_H}V${BENCH_Y - 2}`} markerEnd="url(#m-arch-arrow-red)" />
          <text className="m-arch__red" x={s2 + 10} y={STAGE_Y + STAGE_H + 40}>
            Locked: skips the model,
          </text>
          <text className="m-arch__red" x={s2 + 10} y={STAGE_Y + STAGE_H + 56}>
            straight to a person
          </text>

          {/* Recommendation into the workbench */}
          <path className="m-arch__line" d={`M${s5} ${STAGE_Y + STAGE_H}V${BENCH_Y - 2}`} markerEnd="url(#m-arch-arrow)" />
          <text className="m-arch__s" x={s5 - 10} y={STAGE_Y + STAGE_H + 40} textAnchor="end">
            Recommendation with
          </text>
          <text className="m-arch__s" x={s5 - 10} y={STAGE_Y + STAGE_H + 56} textAnchor="end">
            confidence and citations
          </text>

          {/* Workbench */}
          <rect className="m-arch__box m-arch__box--bench" x={STAGE_X0} y={BENCH_Y} width={W - 16 - STAGE_X0} height={BENCH_H} rx={8} />
          <text className="m-arch__t" x={STAGE_X0 + 16} y={BENCH_Y + 28}>
            Analyst workbench
          </text>
          {[
            ["L1 decides", "Accept or override, with a reason code"],
            ["L2 investigates", "Escalations, SAR clock, draft narrative"],
            ["QA reviews", `A ${Math.round(DEFAULT_POLICY.qaSampleRate * 100)}% sample of agent-assisted closes`],
          ].map(([t, d], i) => (
            <g key={t}>
              <text className="m-arch__t m-arch__t--small" x={STAGE_X0 + 16 + i * 318} y={BENCH_Y + 60}>
                {t}
              </text>
              <text className="m-arch__s" x={STAGE_X0 + 16 + i * 318} y={BENCH_Y + 80}>
                {d}
              </text>
            </g>
          ))}
          <Num x={STAGE_X0 + 196} y={BENCH_Y} n={4} />

          {/* Back to your systems */}
          <path className="m-arch__line" d={`M${STAGE_X0} ${BENCH_Y + 40}H178`} markerEnd="url(#m-arch-arrow)" />
          <path className="m-arch__line m-arch__line--dash" d={`M${STAGE_X0} ${BENCH_Y + 84}H200V${BENCH_Y + 138}H178`} markerEnd="url(#m-arch-arrow)" />
          <Num x={160} y={BENCH_Y} n={5} />

          {/* Audit log under everything */}
          <rect className="m-arch__audit" x={STAGE_X0} y={H - 52} width={W - 16 - STAGE_X0} height={30} rx={6} />
          <text className="m-arch__t m-arch__t--small" x={STAGE_X0 + 16} y={H - 32}>
            Audit log
          </text>
          <text className="m-arch__s" x={STAGE_X0 + 96} y={H - 32}>
            Every run, decision and policy change, with the model and policy version, in a SHA-256 hash chain
          </text>
          <path className="m-arch__line m-arch__line--dash" d={`M${s5} ${BENCH_Y + BENCH_H}V${H - 54}`} markerEnd="url(#m-arch-arrow)" />
        </svg>
      </div>
      {caption && (
        <figcaption>
          The model sits in the middle of the run, boxed in by plain-code rules on both sides. Monitoring products are named as examples of what sends alerts; no affiliation or endorsement implied.
        </figcaption>
      )}
    </figure>
  );
}
