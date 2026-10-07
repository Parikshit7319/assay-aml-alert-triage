import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import "../marketing.css";

/*
 * The policy sandwich: deterministic rules before the model and after it, with
 * what each rule does to the alert. Thresholds come from DEFAULT_POLICY and the
 * L3 bar from metrics-pure, so the picture follows the code. Drawn for a navy
 * band; styled by m-ps classes in marketing.css.
 */

type Tone = "red" | "amber" | "green" | "blue";
interface Row {
  text: string[];
  chip: string;
  tone: Tone;
}
interface Layer {
  title: string;
  note: string;
  rows: Row[];
  model?: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const P = DEFAULT_POLICY;

const LAYERS: Layer[] = [
  {
    title: "Before the model",
    note: "Plain code, same answer every time",
    rows: [
      { text: [`Watchlist name similarity of ${P.watchlistForceL2Similarity.toFixed(2)} or more`], chip: "Forced to L2", tone: "red" },
      { text: ["A memo or payee name that reads like an order"], chip: "Locked to a person", tone: "red" },
      { text: [`Fewer than ${P.minTransactionsForDecision} transactions, or under 60% of the data it needs`], chip: "Agent abstains", tone: "amber" },
    ],
  },
  {
    title: "The model",
    note: "Your choice of model, or the rules model",
    model: true,
    rows: [
      { text: ["Reads the evidence and the computed findings"], chip: "Never sees locked text", tone: "blue" },
      { text: ["Returns close or escalate, a confidence,", "a risk score and a citation for each claim"], chip: "Recommends only", tone: "blue" },
    ],
  },
  {
    title: "After the model",
    note: "Plain code, same answer every time",
    rows: [
      { text: ["Every citation must resolve to a record it was given"], chip: "Else human review", tone: "amber" },
      { text: ["Every dollar figure must trace to the cited records"], chip: "Else no batch or auto-close", tone: "amber" },
      { text: [`A close below ${P.closeConfidenceFloor.toFixed(2)} confidence`], chip: "Becomes human review", tone: "amber" },
      {
        text: [`Auto-close only at L3, at ${P.autoCloseConfidenceFloor.toFixed(2)} or more, after`, `${pct(L3_MIN_AGREEMENT)} QA agreement on ${L3_MIN_QA.toLocaleString("en-US")} reviews`],
        chip: "Closes without a click",
        tone: "green",
      },
    ],
  },
];

const W = 760;
const X0 = 64;
const X1 = W - 16;
const HEAD = 42;
const ROW1 = 40;
const ROW2 = 56;
const GAP = 34;
const TOP = 34;

const chipW = (s: string) => Math.round(s.length * 6.9 + 24);
const textW = (s: string) => s.length * 6.5;
const rowH = (r: Row) => (r.text.length > 1 ? ROW2 : ROW1);
const layerH = (l: Layer) => HEAD + l.rows.reduce((s, r) => s + rowH(r), 0) + 10;

/** Layer positions, top to bottom, computed once. */
const PLACED = LAYERS.reduce<{ l: Layer; top: number }[]>((acc, l) => {
  const prev = acc[acc.length - 1];
  acc.push({ l, top: prev ? prev.top + layerH(prev.l) + GAP : TOP });
  return acc;
}, []);
const LAST = PLACED[PLACED.length - 1];
const H = LAST.top + layerH(LAST.l) + 34;

export function PolicySandwich({ caption = true }: { caption?: boolean }) {
  const placed = PLACED;
  const cx = (X0 + X1) / 2;

  return (
    <figure className="diagram m-ps">
      <div className="diagram-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="m-ps-title m-ps-desc">
          <title id="m-ps-title">Policy rules before and after the model</title>
          <desc id="m-ps-desc">
            Three layers. Before the model, plain code sends a watchlist name similarity of {P.watchlistForceL2Similarity.toFixed(2)} or more to L2, locks an alert to a person when a memo or payee name reads like
            an order, and makes the agent abstain with fewer than {P.minTransactionsForDecision} transactions or under 60% of the data a decision needs. The model reads the evidence and returns a recommendation, a confidence, a risk score
            and a citation for each claim; it never sees locked text and never decides. After the model, plain code sends the alert to human review if a citation does not resolve or a close falls below{" "}
            {P.closeConfidenceFloor.toFixed(2)} confidence, blocks batch and auto-close if a dollar figure does not trace, and allows auto-close only at autonomy level 3, at {P.autoCloseConfidenceFloor.toFixed(2)}{" "}
            confidence or more, after {pct(L3_MIN_AGREEMENT)} QA agreement on {L3_MIN_QA.toLocaleString("en-US")} reviews.
          </desc>
          <defs>
            <marker id="m-ps-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className="m-ps__head" d="M0 0L10 5L0 10z" />
            </marker>
          </defs>

          {/* The evidence travels down the left edge, through every layer */}
          <text className="m-ps__band-t" x={0} y={16}>
            Alert and its evidence
          </text>
          <path className="m-ps__band" d={`M26 ${TOP - 8}V${H - 30}`} />
          <path className="m-ps__band-arrow" d={`M18 ${H - 34}l8 10 8-10`} />
          <text className="m-ps__band-t" x={0} y={H - 4}>
            Recommendation to an analyst, who decides
          </text>

          {placed.map(({ l, top }, li) => {
            let ry = top + HEAD;
            const h = layerH(l);
            return (
              <g key={l.title}>
                <rect className={l.model ? "m-ps__layer m-ps__layer--model" : "m-ps__layer"} x={X0} y={top} width={X1 - X0} height={h} rx={10} />
                <path className="m-ps__tick" d={`M30 ${top + 26}H${X0 - 4}`} />
                <text className={l.model ? "m-ps__t m-ps__t--model" : "m-ps__t"} x={X0 + 22} y={top + 27}>
                  {l.title}
                </text>
                <text className={l.model ? "m-ps__note m-ps__note--model" : "m-ps__note"} x={X1 - 20} y={top + 27} textAnchor="end">
                  {l.note}
                </text>
                {l.rows.map((r) => {
                  const rh = rowH(r);
                  const cw = chipW(r.chip);
                  const chipX = X1 - 20 - cw;
                  const mid = ry + rh / 2;
                  const tEnd = X0 + 22 + Math.max(...r.text.map(textW)) + 12;
                  const g = (
                    <g key={r.chip}>
                      <path className={l.model ? "m-ps__rule m-ps__rule--model" : "m-ps__rule"} d={`M${X0 + 22} ${ry}H${X1 - 20}`} />
                      {r.text.map((t, i) => (
                        <text key={t} className={l.model ? "m-ps__s m-ps__s--model" : "m-ps__s"} x={X0 + 22} y={mid + 5 - ((r.text.length - 1) * 17) / 2 + i * 17}>
                          {t}
                        </text>
                      ))}
                      {chipX - tEnd > 26 && <path className={l.model ? "m-ps__lead m-ps__lead--model" : "m-ps__lead"} d={`M${tEnd} ${mid}H${chipX - 6}`} markerEnd="url(#m-ps-arrow)" />}
                      <rect className={`m-ps__chip m-ps__chip--${r.tone}`} x={chipX} y={mid - 12} width={cw} height={24} rx={12} />
                      <text className={`m-ps__chip-t m-ps__chip-t--${r.tone}`} x={chipX + cw / 2} y={mid + 4} textAnchor="middle">
                        {r.chip}
                      </text>
                    </g>
                  );
                  ry += rh;
                  return g;
                })}
                {li < placed.length - 1 && <path className="m-ps__flow" d={`M${cx} ${top + h + 2}V${top + h + GAP - 3}`} markerEnd="url(#m-ps-arrow)" />}
              </g>
            );
          })}
        </svg>
      </div>
      {caption && <figcaption>Six rules, P1 to P6 in the code, run on every alert in the same order. The thresholds shown are the defaults. Owners and admins can change them, and every change gets a new policy version number.</figcaption>}
    </figure>
  );
}
