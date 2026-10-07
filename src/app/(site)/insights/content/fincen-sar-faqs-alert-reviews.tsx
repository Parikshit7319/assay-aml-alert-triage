import Link from "next/link";
import type { PostSource } from "../posts";

const U = {
  release: "https://www.fincen.gov/news/news-releases/fincen-issues-frequently-asked-questions-clarify-suspicious-activity-reporting",
  faq: "https://www.federalreserve.gov/supervisionreg/srletters/SR2504a1.pdf",
  sr: "https://www.federalreserve.gov/supervisionreg/srletters/SR2504.htm",
  fil: "https://fdic.gov/news/financial-institution-letters/2025/frequently-asked-questions-regarding-suspicious-activity",
  ffiec: "https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/04",
  ctr: "https://www.law.cornell.edu/cfr/text/31/1010.311",
  agg: "https://www.law.cornell.edu/cfr/text/31/1010.313",
  sar: "https://www.law.cornell.edu/cfr/text/31/1020.320",
  usc: "https://www.law.cornell.edu/uscode/text/31/5324",
};

export const tldr = [
  "Activity at or near the $10,000 CTR threshold is not, by itself, enough to require a structuring SAR. The trigger is reason to suspect the activity was designed to evade reporting.",
  "Banks do not have to run a separate review of continuing activity after a SAR. The 90-day cadence was a rule of thumb that hardened into practice.",
  "There is no BSA requirement to document a decision not to file. When you do document, a short statement usually suffices. The FFIEC manual still says banks should, and that section is being updated.",
  "For alert review: ask about evasion, not amounts. Keep no-SAR notes proportionate. Leave the SAR clock where the regulation puts it.",
];

export const sources: PostSource[] = [
  { title: "FinCEN, “FinCEN Issues Frequently Asked Questions to Clarify Suspicious Activity Reporting Requirements,” news release, October 9, 2025", url: U.release },
  { title: "FinCEN, Federal Reserve, FDIC, NCUA and OCC, “Frequently Asked Questions Regarding Suspicious Activity Reporting Requirements,” October 9, 2025", url: U.faq },
  { title: "Federal Reserve, SR 25-4, cover letter for the SAR FAQs, October 10, 2025", url: U.sr },
  { title: "FDIC, FIL-48-2025, Frequently Asked Questions Regarding Suspicious Activity Reporting", url: U.fil },
  { title: "FFIEC BSA/AML Examination Manual, Assessing Compliance with BSA Regulatory Requirements: Suspicious Activity Reporting", url: U.ffiec },
  { title: "31 CFR 1010.311, Filing obligations for reports of transactions in currency", url: U.ctr },
  { title: "31 CFR 1010.313, Aggregation", url: U.agg },
  { title: "31 CFR 1020.320, Reports by banks of suspicious transactions", url: U.sar },
  { title: "31 U.S.C. 5324, Structuring transactions to evade reporting requirement prohibited", url: U.usc },
];

export default function Body() {
  return (
    <>
      <p>
        On October 9, 2025, FinCEN published answers to four questions that financial institutions keep asking about suspicious activity reports. The Federal Reserve, FDIC, NCUA and OCC issued them jointly (<a href={U.release}>FinCEN release</a>). The
        banking agencies were careful to say the FAQs do not change existing requirements or create new supervisory expectations (<a href={U.sr}>Federal Reserve SR 25-4</a>, <a href={U.fil}>FDIC FIL-48-2025</a>). The stated aim is narrower: help
        institutions spend their effort on the reporting that is most useful to law enforcement.
      </p>
      <p>
        That makes the FAQs easy to file and forget. They should not be. Each answer removes a piece of work that many teams do out of habit, and most of that work happens in the alert queue, before anyone at L2 has seen the case.
      </p>

      <h2>1. A deposit near $10,000 is not, by itself, a structuring SAR</h2>
      <p>
        Two rules meet here. Banks file a currency transaction report for cash transactions of more than $10,000, and several transactions count as one when the bank knows they were made by or on behalf of the same person in one business day (
        <a href={U.ctr}>31 CFR 1010.311</a>, <a href={U.agg}>1010.313</a>). Separately, a bank must file a SAR on a transaction of $5,000 or more when it knows, suspects or has reason to suspect the transaction was designed to evade BSA
        requirements (<a href={U.sar}>31 CFR 1020.320</a>).
      </p>
      <p>
        The first FAQ answers the question that sits between those two rules. The mere presence of a transaction or a series of transactions at or near the CTR threshold is &ldquo;not information sufficient to require the filing of a SAR&rdquo; (
        <a href={U.faq}>FAQ, question 1</a>). The obligation turns on knowing, suspecting or having reason to suspect that the activity was meant to evade reporting.
      </p>
      <p>
        The same answer restates how wide structuring is. Under <a href={U.usc}>31 U.S.C. 5324</a> it covers currency transactions of any amount, at one or more institutions, on one or more days, in any manner, when the purpose is to evade the
        CTR. So the FAQ narrows the trigger for a SAR. It does not narrow the offense, and a program still has to monitor for structuring at a level that fits its products, customers and locations.
      </p>
      <p>
        For a reviewer, that turns a structuring alert into a specific question. Not &ldquo;are these deposits under $10,000?&rdquo; The rule that fired already answered that. The question is whether anything in the record points to an intent
        to evade.
      </p>

      <h2>2. You do not need a separate continuing activity review</h2>
      <p>
        In 2000, FinCEN&apos;s SAR Activity Review suggested reporting continuing suspicious activity at least every 90 days. The FAQ says that rule of thumb came to be treated as a requirement. It is not. Institutions are not required to run a
        separate review, manual or automated, after a SAR to find out whether the activity continued. They can rely on risk-based policies and controls reasonably designed to identify and report it (<a href={U.faq}>FAQ, question 2</a>).
      </p>
      <p>
        Many teams run a 90-day calendar for every SAR subject: pull the account, re-review the activity, write it up, decide again. That review can now be kept or retired on risk grounds, instead of being run because everyone assumed it was
        mandatory.
      </p>

      <h2>3. If you do file continuing activity SARs, here is the clock</h2>
      <p>
        For institutions that keep following the continuing activity guidance, the third answer lays out the dates (<a href={U.faq}>FAQ, question 3</a>). When no suspect is identified, the initial filing can take 60 days and the later dates shift
        with it.
      </p>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Event</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">0</td>
              <td>Facts are detected that may require a SAR</td>
            </tr>
            <tr>
              <td className="num">30</td>
              <td>Initial SAR due</td>
            </tr>
            <tr>
              <td className="num">120</td>
              <td>The 90-day continuing activity period ends</td>
            </tr>
            <tr>
              <td className="num">150</td>
              <td>Continuing activity SAR due, with a date range covering the full 90 days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>4. No BSA requirement to document a decision not to file</h2>
      <p>
        The fourth answer is the one compliance teams talk about most. Nothing in the BSA or its regulations requires an institution to document a decision not to file a SAR. FinCEN has encouraged it but never required it. Where an institution
        chooses to document, the level of detail can follow its own risk-based policy, and in most cases a short, concise statement is enough. Complex investigations may call for more (<a href={U.faq}>FAQ, question 4</a>).
      </p>
      <p>The examination manual has not caught up yet. Its SAR section still reads:</p>
      <blockquote>Banks should document SAR decisions, including the specific reason for filing or not filing a SAR.</blockquote>
      <p>
        The same page tells examiners to refer to the recent interagency FAQs while the section is revised (<a href={U.ffiec}>FFIEC manual</a>). Until that revision lands, many BSA officers will keep documenting no-SAR decisions in full. That is a
        defensible choice. What changed is that the depth of that record is now a policy decision rather than an assumption.
      </p>

      <h2>What did not change</h2>
      <ul>
        <li>
          The deadline. A SAR is due no later than 30 calendar days after initial detection of facts that may warrant it, extendable by up to 30 more days when no suspect has been identified, and never past 60 (
          <a href={U.sar}>31 CFR 1020.320(b)(3)</a>).
        </li>
        <li>
          What &ldquo;initial detection&rdquo; means. The FFIEC manual says it is not the moment a transaction is highlighted for review. The period starts once an appropriate review has been done (<a href={U.ffiec}>FFIEC manual</a>).
        </li>
        <li>
          Retention. A copy of each SAR and its supporting documentation stays on file for five years from the filing date (<a href={U.sar}>31 CFR 1020.320(d)</a>).
        </li>
        <li>
          Staffing and timeliness. Examiners still expect adequate staff for identifying, evaluating and reporting suspicious activity, and reviews completed in a reasonable period of time (<a href={U.ffiec}>FFIEC manual</a>).
        </li>
      </ul>

      <h2>What this means for alert triage</h2>
      <p>Most of the effort the FAQs remove sits at L1, which is why they matter to anyone running a queue. Here is how they map onto the way Assay works.</p>
      <h3>Structuring alerts get an evasion question</h3>
      <p>
        Assay computes structuring findings in code before a model sees the alert: the cash deposits between $8,000 and $10,000 in the last 30 days, the locations used, the days with deposits at more than one location, and whether a staff note
        records the customer asking about the $10,000 threshold. The system prompt states the FAQ&apos;s position and tells the model to look for evasion indicators, not amounts alone. Every claim it makes has to cite the transaction or note
        behind it, and a claim that cites nothing sends the alert to a human. The indicators themselves are in{" "}
        <Link href="/insights/structuring-evasion-indicators">Structuring that rules miss</Link>.
      </p>
      <h3>No-SAR depth is a setting, and the cost is storage</h3>
      <p>
        The agent writes a cited rationale for every alert it triages, so keeping a full no-SAR record costs storage, not analyst time. Policy settings let the BSA officer pick full or standard depth. The default is full, which matches the FFIEC
        manual as it reads today.
      </p>
      <h3>Continuing activity stays a human call</h3>
      <p>
        Prior SARs on the customer appear as cited evidence on the next alert, so the reviewer sees the history without a separate lookup. Whether to file a continuing activity SAR, or any SAR, is one of four decisions Assay has no code path to
        make.
      </p>
      <h3>The SAR clock starts where the regulation says</h3>
      <p>
        The queue shows your internal review deadline, which is your policy. The SAR clock starts only when an investigator records a suspicion determination in the L2 view, and then counts 30 days, or 60 when no suspect is identified. You can
        see both clocks on the synthetic alerts in the <Link href="/demo">live demo</Link>.
      </p>
    </>
  );
}
