import type { Metadata } from "next";
import Link from "next/link";
import { POSTS, fmtPostDate } from "./posts";
import "../content.css";

export const metadata: Metadata = {
  title: "Insights",
  description: "Notes on AML alert review, SAR rules and model risk for AI agents, each one tied to the primary documents from FinCEN, the FFIEC and the federal banking agencies.",
};

export default function InsightsPage() {
  const posts = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <header className="ph">
        <div className="wrap">
          <p className="kicker">Insights</p>
          <h1>Notes from the alert queue</h1>
          <p className="ph__lede">
            Short, sourced pieces on the rules that shape alert review and the controls an AI agent needs to be allowed near it. Every regulatory claim links to the primary document. Written by the founder, not a content team.
          </p>
        </div>
      </header>
      <section className="sec sec--tight">
        <div className="wrap wrap--mid">
          <ul className="post-list">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link href={`/insights/${p.slug}`}>
                  <time dateTime={p.date}>{fmtPostDate(p.date)}</time>
                  <div>
                    <h2>{p.title}</h2>
                    <p>{p.dek}</p>
                    <div className="c-post-tags">
                      {p.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                      <span className="tag">{p.readingMinutes} min read</span>
                    </div>
                  </div>
                  <span className="arrow-link" aria-hidden="true">
                    Read
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="c-note">
            Figures used across the site, with their sources and the assumptions behind modeled numbers, are on <Link href="/sources">Sources and assumptions</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
