import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Built by an engineer who has shipped regulated financial platforms</h1>
        </div>
      </header>
      <div className="wrap page-body two-col">
        <div className="prose">
          <p>
            {brand.founder} spent five years as a software engineer on payments and transfer agency platforms. As lead engineer at FIS he delivered an institutional transfer agency platform for a global asset manager. Transfer agency is a regulated function where every investor record and every change has to stand up to audit. Before that he built supply chain and payments systems at Cybermatic Systems, founded a healthcare SaaS company, and automated operations workflows with LLM agents.
          </p>
          <p>He is now an MBA candidate at Rice University&apos;s Jones Graduate School of Business, Class of 2027.</p>
          <h2>Why this product</h2>
          <p>
            Compliance teams are told to do more with the same headcount while most of their queue is noise. Agents can do the evidence gathering, but most AI demos skip the part regulated teams actually need: a record of what the agent saw, what it claimed, which rule overrode it, and who decided. Assay is built from that record outward.
          </p>
          <h2>Where it stands</h2>
          <ul>
            <li>The product, demo and API on this site are working software.</li>
            <li>It has not processed customer production data, and there are no customers yet.</li>
            <li>Performance numbers on this site are modeled and labeled as such until a pilot measures them.</li>
            <li>&ldquo;{brand.name}&rdquo; is a working name.</li>
          </ul>
          <h2>Contact</h2>
          <p>
            <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>, or <a href={brand.founderLinkedIn}>LinkedIn</a>.
          </p>
        </div>
        <aside className="aside-box">
          <h2>Looking for two design partners</h2>
          <p>Fintechs, payment companies and sponsor-bank programs working more than 1,000 alerts a month.</p>
          <Link className="btn" href="/pilot" style={{ width: "100%" }}>
            Request a pilot
          </Link>
        </aside>
      </div>
    </>
  );
}
