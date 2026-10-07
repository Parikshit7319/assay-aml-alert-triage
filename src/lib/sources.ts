/**
 * Cited sources for every market figure on the site. Pure data, shared by the
 * /sources page and anything else that needs a citation's title or URL. Link a
 * citation as /sources#<id>.
 */
export interface Source {
  id: string;
  title: string;
  url: string;
  /** What the site uses from the source, quoted where possible. */
  used: string;
}

export const SOURCES: Source[] = [
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

export const SOURCE_IDS = SOURCES.map((s) => s.id);

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
