import Link from "next/link";
import { GuillocheBand } from "@/components/Guilloche";
import { Wordmark } from "@/components/Wordmark";
import { brand } from "@/lib/brand";
import { REPO_URL } from "@/lib/site-mode";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "How it works" },
      { href: "/demo", label: "Live demo" },
      { href: "/integrations", label: "Integrations" },
      { href: "/developers", label: "API" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/for/bsa-officers", label: "BSA officers" },
      { href: "/for/analyst-leads", label: "Analyst team leads" },
      { href: "/for/model-risk", label: "Model risk" },
      { href: "/day-in-the-queue", label: "A day in the queue" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/insights", label: "Insights" },
      { href: "/security", label: "Security" },
      { href: "/governance", label: "Governance" },
      { href: "/sources", label: "Sources and assumptions" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/pilot", label: "Request a pilot" },
      { href: "/privacy", label: "Privacy" },
      { href: REPO_URL, label: "Source code on GitHub", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="sf">
      <GuillocheBand className="sf__band" height={90} />
      <div className="wrap sf__inner">
        <div className="sf__brand">
          <Wordmark size={20} inverse />
          <p>An AI first-pass analyst for AML alerts. Evidence gathered, every claim cited, humans decide.</p>
          <a className="sf__mail" href={`mailto:${brand.contactEmail}`}>
            {brand.contactEmail}
          </a>
        </div>
        <nav className="sf__cols" aria-label="Footer">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h2>{c.title}</h2>
              {c.links.map((l) =>
                l.external ? (
                  <a key={l.href} href={l.href} rel="noopener">
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>
      <div className="wrap sf__base">
        <span>
          <i className="sf__dot" aria-hidden="true" /> Demo status: runs entirely in your browser, nothing to go down.
        </span>
        <span>{new Date().getFullYear()} Assay (working name). Built in Houston.</span>
      </div>
    </footer>
  );
}
