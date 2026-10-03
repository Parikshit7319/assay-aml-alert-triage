import type { Metadata } from "next";
import Link from "next/link";
import { AUTONOMY_LEVELS, NEVER_AUTOMATED } from "@/lib/engine/policy";

export const metadata: Metadata = { title: "Governance", description: "How Assay keeps humans accountable, records every decision, and produces the evidence model risk and examiners ask for." };

const RAI = [
  ["Accountability", "Each workspace's agent runs under a named identity, and humans own every disposition. A SAR decision can only be recorded by a signed-in person."],
  ["Transparency", "Every recommendation shows its claims, the record behind each claim, the policy rules that fired, the model, and the policy version."],
  ["Reliability and safety", "Deterministic checks before and after the model, abstention on thin files, confidence floors, and autonomy that has to be earned with QA data."],
  ["Privacy and security", "Customer-supplied text is treated as untrusted. API keys are stored as hashes. Enterprise runs in your own Azure subscription with your own model endpoint."],
  ["Fairness", "Protected attributes are not inputs. Disposition and override rates can be compared across customer segments from the decision log."],
  ["Inclusiveness", "Words plus colour for every status, keyboard-reachable controls, and visible focus throughout the workbench."],
];

export default function GovernancePage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Governance is most of the product</h1>
          <p>An agent that clears alerts is easy to build. One that a BSA officer, a model risk team and an examiner will accept has to produce its own evidence. This page lists what Assay records, what it refuses to do, and what it does not have yet.</p>
        </div>
      </header>
      <div className="wrap page-body two-col">
        <div className="prose">
          <h2>Why this matters now</h2>
          <p>
            In April 2026 the Federal Reserve, OCC and FDIC replaced their 2011 model risk guidance, including the 2021 statement on BSA/AML models. The new guidance says: &ldquo;Generative AI and agentic AI models are novel and rapidly evolving. As such, they are not within the scope of this guidance.&rdquo; Banks are told to govern those tools under their own risk management.
            <sup>
              <Link href="/sources#sr-26-2">1</Link>
            </sup>{" "}
            In practice that means the tool has to arrive with the governance evidence built in.
          </p>
          <p>
            The same month, FinCEN proposed a rule under which examiners would consider whether a bank employs &ldquo;innovative tools such as artificial intelligence.&rdquo; As of the last check it was still a proposal.
            <sup>
              <Link href="/sources#fincen-nprm-2026">2</Link>
            </sup>
          </p>

          <h2>What it will never do</h2>
          <ul>
            {NEVER_AUTOMATED.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p>These are not settings that can be switched on. The code has no path for the agent to take these actions.</p>

          <h2>Autonomy is earned, per alert type</h2>
          <table>
            <tbody>
              {AUTONOMY_LEVELS.map((l) => (
                <tr key={l.level}>
                  <th scope="row" style={{ width: 150, color: "var(--ink)" }}>
                    L{l.level} {l.name}
                  </th>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>What gets recorded</h2>
          <ul>
            <li>
              <b>Every run:</b> agent identity, model, policy version, the full investigation trace, claims with citations, policy rules that fired, validation results, tokens and cost.
            </li>
            <li>
              <b>Every decision:</b> who, when, what the agent recommended, whether the person agreed, and a reason code for overrides.
            </li>
            <li>
              <b>Every policy change:</b> a new version number with the before and after values. Past runs keep the version they ran under.
            </li>
            <li>
              <b>One audit log</b> of all of the above, hash-chained with SHA-256 so an edit or deletion anywhere is detectable. The workbench re-verifies the chain on every view and exports it as CSV or JSON.
            </li>
          </ul>

          <h2>Two clocks, kept separate</h2>
          <p>
            The FFIEC manual says the 30-day SAR period does not start when a transaction is flagged; it starts when review determines the activity is suspicious, with 60 days when no suspect is identified.
            <sup>
              <Link href="/sources#ffiec-sar">3</Link>
            </sup>{" "}
            Assay shows your internal review deadline in the queue and starts the SAR clock only when an investigator records that determination.
          </p>

          <h2>Documenting decisions not to file</h2>
          <p>
            FinCEN&apos;s October 2025 FAQ states there is &ldquo;no requirement or expectation&rdquo; under the BSA to document a decision not to file a SAR. The FFIEC manual still says banks should.
            <sup>
              <Link href="/sources#fincen-sar-faq-2025">4</Link>
            </sup>{" "}
            Assay keeps the full cited rationale by default and lets your policy set the depth.
          </p>

          <h2>Mapped to Microsoft&apos;s Responsible AI Standard</h2>
          <table>
            <tbody>
              {RAI.map(([p, d]) => (
                <tr key={p}>
                  <th scope="row" style={{ width: 170, color: "var(--ink)" }}>
                    {p}
                  </th>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>What does not exist yet</h2>
          <ul>
            <li>No SOC 2 report. No audit has started.</li>
            <li>No independent model validation or third-party penetration test.</li>
            <li>No customer production data has been processed. The public demo uses synthetic data only.</li>
          </ul>
          <p>Design partners get the full control documentation and source access for their model risk review.</p>
        </div>
        <aside className="aside-box">
          <h2>Ask for the control pack</h2>
          <p>Policy defaults, the validation rules, the audit hash scheme and a sample exported log from a demo workspace.</p>
          <Link className="btn" href="/pilot" style={{ width: "100%" }}>
            Request a pilot
          </Link>
        </aside>
      </div>
    </>
  );
}
