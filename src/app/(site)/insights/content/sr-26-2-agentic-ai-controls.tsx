import Link from "next/link";
import { DEFAULT_POLICY } from "@/lib/engine/policy";
import { MODEL_RISK_SECTIONS } from "@/lib/exports/model-risk";
import { L3_MIN_AGREEMENT, L3_MIN_QA } from "@/lib/metrics-pure";
import type { PostSource } from "../posts";

const U = {
  sr: "https://www.federalreserve.gov/supervisionreg/srletters/SR2602.htm",
  guidance: "https://www.federalreserve.gov/supervisionreg/srletters/SR2602a1.pdf",
  occ: "https://www.occ.gov/news-issuances/bulletins/2026/bulletin-2026-13.html",
  fdic: "https://www.fdic.gov/news/press-releases/2026/agencies-issue-revised-model-risk-guidance",
  nprm: "https://www.fincen.gov/system/files/2026-04/Program-NPRM-FactSheet.pdf",
  ffiec: "https://bsaaml.ffiec.gov/manual/AssessingComplianceWithBSARegulatoryRequirements/04",
  anthropic: "https://www.anthropic.com/legal/commercial-terms",
  openai: "https://openai.com/enterprise-privacy/",
  azure: "https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy",
};

export const tldr = [
  "SR 26-2 (OCC Bulletin 2026-13), issued April 17, 2026 by the Fed, OCC and FDIC, replaced SR 11-7 and the 2021 interagency statement on BSA/AML models.",
  "A footnote puts generative and agentic AI outside its scope. Controls for those tools fall back to the bank's own risk management and governance. That is a gap to fill, not an exemption.",
  "The guidance's own structure still works as a template: conceptual soundness, outcomes analysis, ongoing monitoring, effective challenge, documentation.",
  "A workable control set for a triage agent has nine parts, from bounded authority and grounded claims to earned autonomy and an exportable file.",
];

export const sources: PostSource[] = [
  { title: "Federal Reserve, SR 26-2, Revised Guidance on Model Risk Management, April 17, 2026", url: U.sr },
  { title: "Federal Reserve, OCC and FDIC, Supervisory Guidance on Model Risk Management (attachment to SR 26-2)", url: U.guidance },
  { title: "OCC Bulletin 2026-13, Model Risk Management: Revised Guidance, April 17, 2026", url: U.occ },
  { title: "FDIC, press release on the revised model risk guidance, April 17, 2026", url: U.fdic },
  { title: "FinCEN, fact sheet on the proposed AML/CFT program rule, April 7, 2026", url: U.nprm },
  { title: "FFIEC BSA/AML Examination Manual, Suspicious Activity Reporting", url: U.ffiec },
  { title: "Anthropic, Commercial Terms of Service, effective June 17, 2025", url: U.anthropic },
  { title: "OpenAI, enterprise privacy page (API data and training)", url: U.openai },
  { title: "Microsoft Learn, “Data, privacy, and security for Models sold by Azure in Microsoft Foundry”", url: U.azure },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Body() {
  return (
    <>
      <p>
        On April 17, 2026, the Federal Reserve, OCC and FDIC replaced the model risk guidance that US banks had worked under since 2011. The Fed issued it as SR 26-2 and the OCC as Bulletin 2026-13. It supersedes SR 11-7 and SR 21-8, the 2021
        interagency statement on model risk for systems supporting BSA/AML compliance (<a href={U.sr}>SR 26-2</a>). The OCC rescinded its matching 2021 bulletin, and the FDIC rescinded its letters on both documents (<a href={U.occ}>OCC
        Bulletin 2026-13</a>, <a href={U.fdic}>FDIC</a>).
      </p>
      <p>
        A footnote in the new guidance puts generative and agentic AI models outside its scope, describing them as novel and rapidly evolving (<a href={U.guidance}>guidance, footnote 3</a>). For anyone running or buying an AI agent that triages
        transaction-monitoring alerts, that footnote is the most important line in the document.
      </p>

      <h2>What the new guidance does</h2>
      <p>The shape will be familiar to anyone who worked under SR 11-7, with a lighter touch:</p>
      <ul>
        <li>
          It is risk-based and expected to be most relevant to banking organizations with more than $30 billion in total assets, though it may apply to smaller ones with significant model risk (<a href={U.sr}>SR 26-2</a>,{" "}
          <a href={U.occ}>OCC</a>).
        </li>
        <li>
          It is not enforceable, and the agencies say non-compliance will not by itself draw supervisory criticism. Unsafe or unsound practices can still (<a href={U.guidance}>guidance, section I</a>).
        </li>
        <li>
          Validation has three parts: conceptual soundness, outcomes analysis against real-world results, and ongoing monitoring as data and conditions change. Effective challenge means critical review by people with the expertise,
          independence and standing to force a change (<a href={U.guidance}>guidance, sections III and V</a>).
        </li>
        <li>
          A model is a complex quantitative method that applies statistical, economic or financial theory to turn inputs into estimates. Deterministic rule-based processes without that kind of theory behind them are excluded from the
          definition (<a href={U.guidance}>guidance</a>).
        </li>
      </ul>

      <h2>Why &ldquo;out of scope&rdquo; is not &ldquo;no expectations&rdquo;</h2>
      <p>
        For tools the guidance does not cover, the footnote says the bank&apos;s own risk management and governance practices should guide the controls (<a href={U.guidance}>guidance, footnote 3</a>). The OCC added that the agencies plan a
        request for information on model risk management, including banks&apos; use of generative and agentic AI (<a href={U.occ}>OCC Bulletin 2026-13</a>).
      </p>
      <p>
        Look at what that leaves for a typical AI triage tool. Its deterministic rules fall outside the definition of a model. Its language model falls outside the scope of the guidance. Neither half is covered, and the BSA/AML statement that
        used to connect monitoring systems to model risk management has been withdrawn. If your validation procedures cite SR 21-8, they now cite a rescinded document.
      </p>
      <p>
        None of this takes the tool out of an examination. Examiners still assess the SAR process itself: adequate staff for identifying and evaluating suspicious activity, reviews completed in a reasonable time, and documented decisions (
        <a href={U.ffiec}>FFIEC manual</a>). FinCEN&apos;s April 2026 proposal for AML/CFT programs would also have examiners consider whether a bank is employing innovative tools such as artificial intelligence, though as of this writing that is
        still a proposal (<a href={U.nprm}>FinCEN fact sheet</a>). The agent will be examined through the BSA program whether or not model risk guidance names it.
      </p>

      <h2>A control set for agentic triage</h2>
      <p>
        The practical answer is to borrow the structure of SR 26-2 anyway and adapt each part to what an agent actually does. An agent that triages alerts reads records, calls a model, writes claims and proposes a disposition. These nine controls
        cover that loop.
      </p>
      <ol className="c-controls">
        <li>
          <b>Bounded authority, enforced in code.</b> Write down what the agent may never do, and make it impossible rather than discouraged. For alert triage the list should include the SAR filing decision, clearing a sanctions or watchlist
          match, contacting a customer, and changing its own thresholds. A sentence in a prompt is not a control.
        </li>
        <li>
          <b>Deterministic checks on both sides of the model.</b> Rules that run before the model (route strong watchlist matches to L2, abstain on thin files) and after it (confidence floors, downgrades). Because these are not models under the
          new definition, document them as controls with owners and tests.
        </li>
        <li>
          <b>Grounded claims, checked mechanically.</b> Every claim in a rationale should cite a record the agent was given, and code should verify each citation exists and each dollar figure traces to the cited records. A failure should send
          the alert to a person, never to the analyst as a confident recommendation.
        </li>
        <li>
          <b>Versioned runs.</b> For every recommendation, record the model and provider, the prompt version, the policy version, the agent identity, the evidence it saw and the steps it took. Without this, outcomes analysis has nothing to
          stand on.
        </li>
        <li>
          <b>Shadow testing before anyone sees the output.</b> This is the outcomes analysis. Run the agent on alerts your team has already decided, hide its recommendations, and compare by alert type. Look hardest at the cases where the agent
          would have closed and your analysts escalated.
        </li>
        <li>
          <b>Sampled QA in production.</b> This is the ongoing monitoring. Draw a random sample of agent-assisted closes for a second reviewer and track agreement, override rates and override reasons by alert type.
        </li>
        <li>
          <b>Autonomy earned per alert type.</b> Recommend-only is the default. Batch approval or auto-close for a given alert type should require a stated agreement rate on a stated number of QA reviews, plus written sign-off, and should drop
          back when agreement falls.
        </li>
        <li>
          <b>Human-only change control, and untrusted inputs treated as hostile.</b> Policy changes come from named roles, get a version number and keep their before and after values. A new model or prompt reruns the shadow set. Memos and
          counterparty names are written by customers, so instruction-like text in them should lock the alert, not reach the model.
        </li>
        <li>
          <b>An exportable file, including vendor terms.</b> Effective challenge needs a document: purpose, data lineage, method, controls, performance, limitations, change history and sign-off. It should also record what the model provider may
          do with the data. Anthropic&apos;s commercial terms say it may not train models on customer content from its services (<a href={U.anthropic}>Anthropic</a>). OpenAI says API data is not used for training unless the customer opts in (
          <a href={U.openai}>OpenAI</a>). Microsoft says Azure OpenAI prompts and completions are not available to OpenAI and are not used to train foundation models without permission (<a href={U.azure}>Microsoft</a>).
        </li>
      </ol>

      <h2>What this means for alert triage</h2>
      <p>I built Assay around that list, so here is how it maps, including the parts that are not done.</p>
      <ul>
        <li>
          <b>Bounded authority.</b> Four actions have no code path: the SAR decision, clearing a watchlist match, contacting a customer, and changing its own policy.
        </li>
        <li>
          <b>Deterministic checks.</b> Six policy rules run around the model. Watchlist similarity at or above {DEFAULT_POLICY.watchlistForceL2Similarity.toFixed(2)} forces L2. Fewer than {DEFAULT_POLICY.minTransactionsForDecision}{" "}
          transactions makes the agent abstain. A close below {DEFAULT_POLICY.closeConfidenceFloor.toFixed(2)} confidence becomes human review. Instruction-like text in a memo locks the alert before any model call.
        </li>
        <li>
          <b>Grounded claims.</b> Citations and dollar figures are validated against the evidence bundle before an analyst sees the recommendation.
        </li>
        <li>
          <b>Versioned runs.</b> Each run records the agent identity, provider, model, policy version and a hash of the prompt template, with the full trace.
        </li>
        <li>
          <b>Shadow testing and QA.</b> Autonomy level L0 is shadow mode. QA samples {pct(DEFAULT_POLICY.qaSampleRate)} of agent-assisted closes by default.
        </li>
        <li>
          <b>Earned autonomy.</b> Moving an alert type to auto-close requires an owner or admin to attest to {pct(L3_MIN_AGREEMENT)} agreement on {L3_MIN_QA.toLocaleString("en-US")} QA-reviewed alerts and written approval, and the metrics
          screen shows each type&apos;s progress toward that bar. Today that gate is an attestation, not an automatic lock, and it does not yet step down on its own when agreement falls. Only owners and admins can change policy, and every
          change is versioned in a SHA-256 hash-chained audit log.
        </li>
        <li>
          <b>The file.</b> The model risk documentation export has {MODEL_RISK_SECTIONS.length} sections, from &ldquo;{MODEL_RISK_SECTIONS[0]}&rdquo; to &ldquo;{MODEL_RISK_SECTIONS[MODEL_RISK_SECTIONS.length - 1]}&rdquo;, filled from live policy,
          run and QA statistics.
        </li>
      </ul>
      <p>
        What does not exist yet: an independent validation, a SOC 2 report, and any production data run through it. A design partner&apos;s model risk team is the first effective challenge it will get, which is the point of the{" "}
        <Link href="/for/model-risk">model risk page</Link> and the <Link href="/pilot">pilot</Link>.
      </p>
    </>
  );
}
