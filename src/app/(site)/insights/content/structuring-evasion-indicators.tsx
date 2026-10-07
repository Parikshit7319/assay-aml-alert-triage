import Link from "next/link";
import { HERO_AMOUNTS } from "@/lib/demo/scenarios";
import type { PostSource } from "../posts";

const U = {
  usc: "https://www.law.cornell.edu/uscode/text/31/5324",
  ctr: "https://www.law.cornell.edu/cfr/text/31/1010.311",
  agg: "https://www.law.cornell.edu/cfr/text/31/1010.313",
  sar: "https://www.law.cornell.edu/cfr/text/31/1020.320",
  pamphlet: "https://www.fincen.gov/sites/default/files/shared/CTRPamphlet.pdf",
  faq: "https://www.federalreserve.gov/supervisionreg/srletters/SR2504a1.pdf",
  redflags: "https://bsaaml.ffiec.gov/manual/Appendices/07",
  funnel: "https://www.fincen.gov/resources/advisories/fincen-advisory-fin-2014-a005",
};

export const tldr = [
  "Structuring means breaking up cash activity to evade the CTR, which banks file for more than $10,000 in currency in one business day. Under 31 U.S.C. 5324 it is an offense whether or not the money is clean.",
  "Since October 2025 the regulators have said amounts near the threshold are not, by themselves, enough to require a SAR. The question is evasion.",
  "Indicators with real evidentiary weight: same-day deposits at different locations, tight clustering just under $10,000, the customer's own words about the threshold, several people funding one account, and cash in followed quickly by wires out.",
  "Context cuts the other way too. A cash business whose deposits have looked the same for two years is not evading anything.",
];

export const sources: PostSource[] = [
  { title: "31 U.S.C. 5324, Structuring transactions to evade reporting requirement prohibited", url: U.usc },
  { title: "31 CFR 1010.311, Filing obligations for reports of transactions in currency", url: U.ctr },
  { title: "31 CFR 1010.313, Aggregation", url: U.agg },
  { title: "31 CFR 1020.320, Reports by banks of suspicious transactions", url: U.sar },
  { title: "FinCEN, “Notice to Customers: A CTR Reference Guide”", url: U.pamphlet },
  { title: "FinCEN, Federal Reserve, FDIC, NCUA and OCC, “Frequently Asked Questions Regarding Suspicious Activity Reporting Requirements,” October 9, 2025", url: U.faq },
  { title: "FFIEC BSA/AML Examination Manual, Appendix F: Money Laundering and Terrorist Financing Red Flags", url: U.redflags },
  { title: "FinCEN Advisory FIN-2014-A005, “Update on U.S. Currency Restrictions in Mexico: Funnel Accounts and TBML,” May 28, 2014", url: U.funnel },
];

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function Body() {
  const lo = Math.min(...HERO_AMOUNTS);
  const hi = Math.max(...HERO_AMOUNTS);
  return (
    <>
      <p>
        Most structuring rules ask one question: did cash deposits land in a band just under $10,000, often enough, within a window? A common shape, and the one in our demo, is three or more cash deposits between $8,000 and $10,000 within 30 days.
        It is cheap to run and easy to explain to an examiner. It is also a poor test of the thing that makes structuring an offense, which is purpose.
      </p>
      <p>
        This post is about the evidence that speaks to purpose: where the regulators describe it, what it looks like in core banking data, and how to teach an agent to find it.
      </p>

      <h2>The reporting rule and the offense</h2>
      <p>
        A bank files a currency transaction report for each cash transaction of more than $10,000 (<a href={U.ctr}>31 CFR 1010.311</a>). Several transactions are treated as one when the bank knows they were made by or on behalf of the same person
        and they total more than $10,000 in one business day. For this purpose all of a bank&apos;s domestic branches count as one institution (<a href={U.agg}>31 CFR 1010.313</a>).
      </p>
      <p>
        Structuring is arranging transactions to avoid that report. <a href={U.usc}>31 U.S.C. 5324</a> makes it an offense to structure, help structure, or attempt to structure transactions with one or more domestic financial institutions for
        the purpose of evading the reporting requirement. The base offense does not depend on where the money came from. FinCEN&apos;s customer pamphlet makes the point with an ordinary example: a man sells his truck for $15,000 and splits the
        deposit to stay under the threshold. That is structuring, even though the money came from a legitimate sale (<a href={U.pamphlet}>FinCEN CTR reference guide</a>).
      </p>
      <p>
        Banks have their own obligation. A SAR is required for a transaction of $5,000 or more that the bank knows, suspects or has reason to suspect was designed to evade BSA requirements (<a href={U.sar}>31 CFR 1020.320</a>). In October 2025,
        FinCEN and the banking agencies said the presence of transactions at or near the CTR threshold is not, by itself, enough to require that SAR (<a href={U.faq}>SAR FAQ, question 1</a>). The amount is where a review starts. Evidence of
        evasion is what finishes it.
      </p>

      <h2>Why the threshold rule over-fires and under-fires</h2>
      <p>
        The band rule fires on every cash-heavy business whose normal daily deposit happens to fall between $8,000 and $10,000. A convenience store can trip it every month for years. Meanwhile it misses the customer who keeps every deposit under
        $3,000 and spreads them across several accounts, a pattern the FFIEC lists as a red flag in its own right (<a href={U.redflags}>FFIEC Appendix F</a>). Amount is a filter. It is not a finding.
      </p>

      <h2>Indicators worth teaching an agent</h2>
      <p>
        Each indicator below comes from a primary source and can be found in records a bank already holds. That matters for an agent: if it cannot point to the record, it should not make the claim.
      </p>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Indicator</th>
              <th scope="col">Where the regulators describe it</th>
              <th scope="col">What the record shows</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Same-day deposits at different locations</td>
              <td>
                <a href={U.redflags}>FFIEC Appendix F</a>: deposits structured through multiple branches
              </td>
              <td>Two or more near-threshold cash deposits on one calendar day, at more than one branch</td>
            </tr>
            <tr>
              <td>Clustering just under the threshold</td>
              <td>
                <a href={U.redflags}>FFIEC Appendix F</a>: currency deposited in amounts just below reporting thresholds
              </td>
              <td>A tight band of amounts, such as {usd(lo)} to {usd(hi)}, repeated over days</td>
            </tr>
            <tr>
              <td>The customer&apos;s own words</td>
              <td>
                <a href={U.redflags}>FFIEC Appendix F</a>: persuading staff not to file, reluctance to give CTR information, asking for an exemption
              </td>
              <td>A teller or branch note, a complaint, a recorded call</td>
            </tr>
            <tr>
              <td>Several people funding one account</td>
              <td>
                <a href={U.funnel}>FinCEN FIN-2014-A005</a> on funnel accounts; <a href={U.redflags}>FFIEC Appendix F</a> on groups depositing together
              </td>
              <td>Different conductors, often at branches far from the account&apos;s home market</td>
            </tr>
            <tr>
              <td>Cash in, wires out</td>
              <td>
                <a href={U.redflags}>FFIEC Appendix F</a>: deposits wired to another city or country almost immediately
              </td>
              <td>Hours or days between the deposits and an outbound wire of similar size</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Same-day, multi-location</h3>
      <p>
        A bank&apos;s domestic branches count as one institution for aggregation, so splitting one day&apos;s cash between two locations should not avoid a CTR once the bank knows the deposits belong to one person. People still try it, and the
        attempt itself is evidence. The pattern is precise enough to test: group the near-threshold
        deposits by calendar day and count the days with deposits at more than one location. A single such day can be coincidence. Two in two weeks is harder to explain.
      </p>
      <h3>Clustering</h3>
      <p>
        Legitimate cash tends to vary with hours worked or the day of the week. Nine deposits that all sit between {usd(lo)} and {usd(hi)} describe someone aiming at a number. Measure the band, the count and the span of days.
      </p>
      <h3>The customer&apos;s own words</h3>
      <p>
        Knowledge of the reporting requirement is what separates structuring from coincidence, and the best evidence of knowledge is usually written down by bank staff. A note that the customer asked whether deposits over $10,000 are reported,
        followed by a run of deposits just under it, carries more weight than any amount pattern. It is also the indicator most often missed, because it lives in free-text notes that a rule engine never reads.
      </p>
      <h3>Several depositors, one account</h3>
      <p>
        FinCEN&apos;s 2014 funnel account advisory describes accounts receiving many cash deposits below $10,000 from different people, often at branches outside the account&apos;s region, with the money withdrawn elsewhere soon after (
        <a href={U.funnel}>FIN-2014-A005</a>). One caution for anyone automating this: transaction feeds often carry no conductor for cash deposits. When the bank records who made the deposit, it belongs in the evidence. When it does not, the
        honest finding is &ldquo;conductor not recorded,&rdquo; not a guess.
      </p>
      <h3>Cash in, wires out</h3>
      <p>
        Structured cash that leaves by wire within days is a different risk from structured cash that sits in a savings account. Measure the hours from the first deposit to the outbound wire, the share of inbound money that leaves, and whether the
        destination is on the bank&apos;s high-risk list.
      </p>

      <h2>Context that argues against structuring</h2>
      <ul>
        <li>A cash-intensive business whose deposits have sat in the same band for years, with an onboarding interview that expected them.</li>
        <li>A single, documented event, such as a private vehicle sale reviewed on an earlier alert.</li>
        <li>One location, a regular cadence, and volume in line with the expected monthly activity on the customer profile.</li>
      </ul>
      <p>
        None of these clears an alert on its own. They are the facts a good L1 analyst writes down when closing one, and an agent should be held to the same standard: cite the history, or do not rely on it.
      </p>

      <h2>What this means for alert triage</h2>
      <p>
        In Assay, structuring findings are computed in code before the model is called, from the same records the analyst sees. The structuring check takes cash deposits from $8,000 to just under $10,000 in the last 30 days and records the count, total,
        minimum and maximum, the locations used, the span in days, the number of days with deposits at more than one location, and whether the customer&apos;s KYC notes mention the $10,000 threshold, a CTR, or reporting to the government. The
        funnel check counts inbound credits and distinct senders and measures the hours between them and the outbound wire. Prior SARs on the customer are part of the evidence.
      </p>
      <p>
        The model then assesses those findings. Its system prompt carries the October 2025 FAQ position and tells it to look for evasion indicators, not amounts alone. Every claim must cite a record id that was in the evidence, or the alert goes to human review
        instead of arriving as a recommendation. Every dollar figure must trace to a cited transaction or a sum of cited transactions, or batch approval and auto-close are switched off for that alert.
      </p>
      <p>
        The demo&apos;s first alert is built to exercise all of this. It has {HERO_AMOUNTS.length} cash deposits from {usd(lo)} to {usd(hi)} at three locations over 12 days, two of those days with deposits at two different locations, and a staff
        note recording the customer asking whether deposits over $10,000 are reported to the government. The agent recommends escalation and drafts a narrative for the L2 investigator. The same queue holds a convenience store whose cash deposits
        have sat in the same band for two years, with an onboarding note that expects them. The rule fires on both. The evidence does not point the same way.
      </p>
      <p>
        The agent never decides whether to file a SAR, and never rules on whether a pattern is structuring as a legal matter. It assembles the indicators, cites them, and recommends. You can open both alerts in the{" "}
        <Link href="/demo">live demo</Link> and check every citation against the records.
      </p>
    </>
  );
}
