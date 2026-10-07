import type { Metadata } from "next";
import Link from "next/link";
import { DesignPartner, demoAlertCount } from "@/components/site/DesignPartner";
import { brand } from "@/lib/brand";
import { REPO_URL } from "@/lib/site-mode";
import "../content.css";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${brand.founder} is building ${brand.name}, an AI first-pass analyst for AML alerts: where it stands today, what he believes about the problem, and how to reach him.`,
};

const GITHUB = "https://github.com/Parikshit7319";

const BELIEFS = [
  {
    h: "The work to remove is assembly, not judgment.",
    p: (
      <>
        Up to 85% of financial crime compliance work is administrative or nonanalytical.
        <sup>
          <Link href="/sources#mckinsey-2020">1</Link>
        </sup>{" "}
        Pulling the same records for every alert and writing down why it is fine is exactly the work software should take. Deciding what is suspicious is not.
      </>
    ),
  },
  {
    h: "An agent that cannot show its sources does not belong in the queue.",
    p: (
      <>
        Language models are fluent and confident, and they will cite things that are not there unless the system checks. In Assay every claim cites a record, and code verifies the citation and the dollar figure before an analyst sees it.
      </>
    ),
  },
  {
    h: "Autonomy should be earned per alert type, on the bank's own data.",
    p: <>Payroll alerts and sanctions name matches do not deserve the same trust. Shadow mode and QA sampling measure agreement type by type, and the autonomy ladder moves only when a named owner or admin moves it, with those numbers in front of them.</>,
  },
  {
    h: "Some decisions stay human by design.",
    p: <>Filing a SAR, clearing a watchlist match, contacting a customer and changing the agent&apos;s own policy are not settings. There is no code path for them, and there should not be.</>,
  },
];

export default function AboutPage() {
  return (
    <>
      <header className="ph">
        <div className="wrap">
          <p className="kicker">About</p>
          <h1>One founder, working software, no customers yet.</h1>
          <p className="ph__lede">
            I&apos;m {brand.founder}. I build software for regulated financial operations, and {brand.name} is my attempt to take the clerical work out of AML alert review without taking the analyst out of the decision.
          </p>
        </div>
      </header>

      <section className="sec">
        <div className="wrap split split--wide split--top">
          <div className="c-founder founder-card" style={{ gridTemplateColumns: "1fr" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://github.com/Parikshit7319.png" alt="Parikshit Ambhore" width="200" height="200" />
            <div>
              <h2>{brand.founder}</h2>
              <p className="fine">Founder, {brand.name}</p>
              <dl>
                <dt>Based in</dt>
                <dd>Houston, Texas</dd>
                <dt>Before</dt>
                <dd>5+ years in software engineering, payments and transfer agency</dd>
                <dt>Now</dt>
                <dd>MBA candidate, Rice University, Jones Graduate School of Business, Class of 2027</dd>
              </dl>
            </div>
          </div>
          <div className="prose">
            <h2 style={{ marginTop: 0 }}>Why I am building this</h2>
            <p>
              I spent more than five years as a software engineer on payments and transfer agency platforms. As a lead engineer at FIS, I delivered an institutional transfer agency platform for a global asset manager. Before that I built supply
              chain and payments systems at Cybermatic Systems. Transfer agency and payments are regulated, record-heavy work: every investor record and every money movement has to stand up to an audit.
            </p>
            <p>
              On those platforms I saw where the hours went. The slow part was rarely the software. It was the queue of exceptions waiting for a person to pull records from several screens, check them against a rule, and write down why the item
              was fine. Most of them were fine. All of them took the same time.
            </p>
            <p>
              More recently I have built LLM and agentic workflow automation, and learned where it breaks. It is quick at gathering and summarizing, and it will state things that are not in the records unless something checks it. Both lessons
              are in {brand.name}: the agent does the gathering and the first draft, and deterministic code checks every citation and dollar figure it writes.
            </p>
            <p>I am now an MBA candidate at Rice University in Houston, Class of 2027, and building {brand.name} alongside the program.</p>

            <h2>Where it stands</h2>
            <ul>
              <li>
                The product is working software: the triage engine, the workbench, the REST API and CSV import, billing, and a <Link href="/demo">demo</Link> that runs in your browser on {demoAlertCount()} synthetic alerts.
              </li>
              <li>It has never processed real customer data. There are no customers and no revenue.</li>
              <li>Performance numbers on this site are modeled and labeled as modeled until a pilot measures them.</li>
              <li>I am looking for three design partners to run a shadow-mode pilot on their own historical alerts.</li>
              <li>&ldquo;{brand.name}&rdquo; is a working name; trademark and domain clearance are pending.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="sec sec--deep">
        <div className="wrap">
          <div className="sec-head">
            <p className="kicker">What I believe about the problem</p>
            <h2>Four convictions the product is built on.</h2>
          </div>
          <ol className="ruled c-beliefs">
            {BELIEFS.map((b) => (
              <li key={b.h}>
                <h3>{b.h}</h3>
                <p>{b.p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="wrap split split--top">
          <div>
            <p className="kicker">How to reach me</p>
            <h2>Email is fastest.</h2>
            <p className="split__lede">If you run an alert queue, own a BSA program or validate models at a bank, credit union, sponsor bank or MSB, I would like to hear how your team works today, whether or not you want a pilot.</p>
          </div>
          <ul className="ruled" aria-label="Contact">
            <li>
              <h3>Email</h3>
              <p>
                <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
              </p>
            </li>
            <li>
              <h3>LinkedIn</h3>
              <p>
                <a href={brand.founderLinkedIn} rel="noopener">
                  linkedin.com/in/parikshitambhore
                </a>
              </p>
            </li>
            <li>
              <h3>GitHub</h3>
              <p>
                <a href={GITHUB} rel="noopener">
                  github.com/Parikshit7319
                </a>
                . The <a href={REPO_URL}>source for this product</a> is public.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <DesignPartner />
    </>
  );
}
