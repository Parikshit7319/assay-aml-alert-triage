import type { Metadata } from "next";
import { OG_IMAGES } from "@/lib/og";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { AUTHOR, POSTS, fmtPostDate, getPost, type PostSource } from "../posts";
import * as FincenFaqs from "../content/fincen-sar-faqs-alert-reviews";
import * as Sr262 from "../content/sr-26-2-agentic-ai-controls";
import * as Structuring from "../content/structuring-evasion-indicators";
import "../../content.css";

interface PostContent {
  default: ComponentType;
  tldr: string[];
  sources: PostSource[];
}

const CONTENT: Record<string, PostContent> = {
  "fincen-sar-faqs-alert-reviews": FincenFaqs,
  "sr-26-2-agentic-ai-controls": Sr262,
  "structuring-evasion-indicators": Structuring,
};

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.dek,
    authors: [{ name: AUTHOR.name, url: AUTHOR.github }],
    openGraph: { images: OG_IMAGES, type: "article", title: post.title, description: post.dek, publishedTime: post.date, authors: [AUTHOR.name] },
  };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  const content = CONTENT[slug];
  if (!post || !content) notFound();
  const Body = content.default;
  const others = POSTS.filter((p) => p.slug !== slug);

  return (
    <article className="post c-post">
      <div className="wrap wrap--narrow">
        <header className="post__head">
          <nav className="ph__crumb" aria-label="Breadcrumb">
            <Link href="/insights">Insights</Link>
          </nav>
          <h1>{post.title}</h1>
          <p className="post__dek">{post.dek}</p>
          <div className="post__meta">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AUTHOR.photo} alt="" width={32} height={32} loading="lazy" decoding="async" />
            <span>
              By <a href={AUTHOR.github}>{AUTHOR.name}</a>
            </span>
            <time dateTime={post.date}>{fmtPostDate(post.date)}</time>
            <span>{post.readingMinutes} min read</span>
          </div>
        </header>

        <section className="post__tldr" aria-labelledby="tldr-h">
          <h2 id="tldr-h">The short version</h2>
          <ul>
            {content.tldr.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <div className="post__body prose">
          <Body />
        </div>

        <footer className="post__foot">
          <h2 className="c-h3">Sources</h2>
          <ol className="c-sources">
            {content.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url}>{s.title}</a>
              </li>
            ))}
          </ol>
          <p className="c-note">This is analysis, not legal advice. Every regulatory statement above links to the primary document; read it before you change a procedure.</p>

          <div className="c-author">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AUTHOR.photo} alt="Parikshit Ambhore" width={64} height={64} loading="lazy" decoding="async" />
            <div>
              <b>{AUTHOR.name}</b>
              <p>
                Founder of Assay. Software engineer on payments and transfer agency platforms, now building an AI first-pass analyst for AML alerts. <Link href="/about">More about me</Link>.
              </p>
            </div>
          </div>

          <h2 className="c-h3" style={{ marginTop: 40 }}>
            Also in Insights
          </h2>
          <ul className="c-sources" style={{ listStyle: "none", paddingLeft: 0 }}>
            {others.map((p) => (
              <li key={p.slug}>
                <Link className="arrow-link" href={`/insights/${p.slug}`}>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
          <div className="actions">
            <Link className="btn" href="/demo">
              Try the live demo
            </Link>
            <Link className="btn btn-outline" href="/pilot">
              Become a design partner
            </Link>
          </div>
        </footer>
      </div>
    </article>
  );
}
