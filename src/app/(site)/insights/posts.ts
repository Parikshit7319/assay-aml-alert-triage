/** Insights post metadata. Bodies live in ./content, one module per post. */

export interface PostSource {
  title: string;
  url: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  /** One or two sentences under the headline and in the index. */
  dek: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Rounded up from the body word count at about 230 words a minute. */
  readingMinutes: number;
  tags: string[];
}

export const AUTHOR = {
  name: "Parikshit Ambhore",
  role: "Founder, Assay",
  photo: "https://github.com/Parikshit7319.png",
  github: "https://github.com/Parikshit7319",
} as const;

export const POSTS: PostMeta[] = [
  {
    slug: "sr-26-2-agentic-ai-controls",
    title: "SR 26-2 left agentic AI out of scope. Here is what banks should do instead",
    dek: "The April 2026 model risk guidance covers statistical models and non-generative AI. For an agent that triages alerts, the bank has to write its own control set. This is a practical one.",
    date: "2026-10-05",
    readingMinutes: 7,
    tags: ["Model risk", "Agentic AI", "Governance"],
  },
  {
    slug: "structuring-evasion-indicators",
    title: "Structuring that rules miss: evasion indicators worth teaching an agent",
    dek: "A threshold rule finds cash deposits between $8,000 and $10,000. It cannot tell a convenience store's normal week from a customer who asked a teller how to avoid a report. These indicators can.",
    date: "2026-09-22",
    readingMinutes: 7,
    tags: ["Structuring", "Typologies", "CTR"],
  },
  {
    slug: "fincen-sar-faqs-alert-reviews",
    title: "What FinCEN's October 2025 SAR FAQs change for alert reviews",
    dek: "Four answers from FinCEN and the four federal banking regulators. None of them changes the law. Three of them change how much effort an L1 queue should spend on alerts that were never going to become SARs.",
    date: "2026-09-08",
    readingMinutes: 6,
    tags: ["SAR", "FinCEN", "Alert review"],
  },
];

export function getPost(slug: string): PostMeta | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function fmtPostDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
