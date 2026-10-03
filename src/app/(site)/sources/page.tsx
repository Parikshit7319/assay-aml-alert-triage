import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sources and assumptions" };

const SOURCES = [
  {
    id: "mckinsey-2020",
    title: "McKinsey & Company, “The investigator-centered approach to financial crime: Doing what matters,” June 1, 2020",
    url: "https://www.mckinsey.com/capabilities/risk-and-resilience/our-insights/the-investigator-centered-approach-to-financial-crime-doing-what-matters",
    used: "“For most banks, more than 90 percent of transaction-monitoring alerts turn out to be false positives.” “Only one or two transaction-monitoring alerts per hundred is typically acted upon.” “As much as 85 percent of FCC and AML activities remain administrative or nonanalytical.”",
  },
  {
    id: "fincen-fy2025",
    title: "FinCEN, Year in Review for Fiscal Year 2025, published May 2026",
    url: "https://www.fincen.gov/system/files/2026-05/FinCEN-Year-in-Review-2025.pdf",
    used: "4.8 million suspicious activity reports filed in FY2025, up from 4.7 million in FY2024.",
  },
  {
    id: "sr-26-2",
    title: "Federal Reserve, OCC and FDIC, SR 26-2 / OCC Bulletin 2026-13, Revised Guidance on Model Risk Management, April 17, 2026",
    url: "https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm",
    used: "Supersedes SR 11-7 and SR 21-8. “Generative AI and agentic AI models are novel and rapidly evolving. As such, they are not within the scope of this guidance.”",
  },
  {
    id: "fincen-nprm-2026",
    title: "FinCEN, Proposed rule on AML/CFT program requirements, fact sheet, April 7, 2026",
    url: "https://www.fincen.gov/system/files/2026-04/Program-NPRM-FactSheet.pdf",
    used: "Examiners would consider “whether the bank is employing innovative tools such as artificial intelligence.” Comments closed June 9, 2026; not final as of BDO's tracker dated August 27, 2026.",
  },
  {
    id: "fincen-sar-faq-2025",
    title: "FinCEN and federal banking agencies, Frequently Asked Questions Regarding Suspicious Activity Reporting, October 9, 2025",
    url: "https://www.federalreserve.gov/supervisionreg/srletters/SR2504a1.pdf",
    used: "“There is no requirement or expectation under the BSA or its implementing regulations for a financial institution to document its decision not to file a SAR.” Structuring SARs are not required absent information that transactions were designed to evade reporting.",
  },
  {
    id: "ffiec-sar",
    title: "FFIEC BSA/AML Examination Manual, Suspicious Activity Reporting",
    url: "https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/04",
    used: "30 days from initial detection, 60 if no suspect is identified. “Initial detection” is not the moment a transaction is highlighted for review. Also: banks “should document SAR decisions, including the specific reason for filing or not filing.”",
  },
  {
    id: "lexisnexis-2024",
    title: "LexisNexis Risk Solutions, True Cost of Financial Crime Compliance Study, US and Canada, February 2024",
    url: "https://risk.lexisnexis.com/about-us/press-room/press-release/20240221-true-cost-of-compliance-us-ca",
    used: "$61 billion annual financial crime compliance cost in the US and Canada.",
  },
  {
    id: "anthropic-pricing",
    title: "Anthropic, model pricing, checked October 3, 2026",
    url: "https://platform.claude.com/docs/en/about-claude/pricing",
    used: "Claude Sonnet 5.5 at $2 per million input tokens and $10 per million output tokens, used to estimate model cost for simulated runs.",
  },
];

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
