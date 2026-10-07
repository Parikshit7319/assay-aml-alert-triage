import type { Metadata } from "next";
import { SOURCES } from "@/lib/sources";

export const metadata: Metadata = { title: "Sources and assumptions" };

const ASSUMPTIONS = [
  ["L1 review time", "30 minutes per alert", "Industry estimates run 20 to 60 minutes; no strong public source. A pilot measures it."],
  ["Loaded analyst cost", "$90,000 a year", "Salary plus benefits; adjust in the calculator."],
  ["Productive hours", "1,560 a year", "130 a month after leave, training and meetings."],
  ["Time saved with the agent", "45% of L1 time", "Half the time on alerts that close, a fifth on alerts that escalate, weighted by a 92% close rate (rounded down)."],
  ["Human-to-human disagreement", "3% of closes", "Guardrail baseline for missed escalations; replace with your QA data."],
  ["Demo history volume", "About 4,000 alerts a month", "A team of about 15 L1 analysts. The demo's weekly history is synthetic."],
];

export default function SourcesPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Sources and assumptions</h1>
          <p>Every figure on this site is either sourced below or listed as an assumption. Assumptions are labeled modeled wherever they appear.</p>
        </div>
      </header>
      <div className="wrap page-body">
        <div className="prose" style={{ maxWidth: 860 }}>
          <h2 style={{ marginTop: 0 }}>Sources</h2>
          <ol>
            {SOURCES.map((s) => (
              <li key={s.id} id={s.id} style={{ marginBottom: 18 }}>
                <a href={s.url}>{s.title}</a>
                <br />
                <span style={{ color: "var(--ink-2)" }}>{s.used}</span>
              </li>
            ))}
          </ol>
          <h2>Assumptions</h2>
          <table>
            <thead>
              <tr>
                <th>Assumption</th>
                <th>Value</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {ASSUMPTIONS.map(([a, v, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td className="num">{v}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
