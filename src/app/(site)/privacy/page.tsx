import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Assay stores, who processes it, and how the site counts page views without cookies, third-party scripts or IP addresses.",
};

export default function PrivacyPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Privacy</h1>
          <p>A plain description of what this service stores. Draft, pending legal review before any customer data is processed.</p>
        </div>
      </header>
      <div className="wrap page-body">
        <div className="prose">
          <h2 style={{ marginTop: 0 }}>What we store</h2>
          <ul>
            <li>
              <b>Account data:</b> your name, email, a hashed password or the identity provider you signed in with, and session records.
            </li>
            <li>
              <b>Workspace data:</b> alerts, customer profiles, transactions and decisions you upload or create, plus the agent&apos;s runs and the audit log.
            </li>
            <li>
              <b>Pilot requests:</b> the details you submit on the pilot form.
            </li>
            <li>
              <b>Billing:</b> handled by Stripe. We store the Stripe customer and subscription IDs, never card numbers.
            </li>
            <li>
              <b>Page views:</b> the minimal, cookie-free counts described under Analytics below.
            </li>
          </ul>
          <h2>Demo workspaces</h2>
          <p>The public demo uses synthetic data only. On the server edition, each demo workspace is tied to a browser cookie and deleted after 24 hours.</p>
          <p>
            The in-browser demo keeps its state in your browser&apos;s local storage so a refresh does not wipe your work, and sends no alert data to us. If you paste your own model key into it, the key stays in your browser and is sent only to the
            provider you chose.
          </p>
          <h2>Cookies</h2>
          <p>A session cookie when you sign in, and a demo cookie when you open the server-edition demo. No advertising or cross-site tracking cookies, and no cookies for analytics.</p>
          <h2>Analytics</h2>
          <p>This site counts page views with its own first-party code. There are no cookies, no third-party scripts and no advertising identifiers involved. For each page view, the server stores:</p>
          <ul>
            <li>the path of the page, such as /pricing;</li>
            <li>the host name of the site that referred you, if any, never the full referring URL;</li>
            <li>a coarse device class, worked out from the width of the browser window;</li>
            <li>a visitor hash that rotates every day. It is salted, so the server cannot reverse it to identify you, and because it changes daily it cannot link your visits across days.</li>
          </ul>
          <p>
            Clicks on a few labeled buttons, such as the demo button, are counted the same way. No IP address is stored. If your browser sends Do Not Track or Global Privacy Control, the page sends nothing at all.
          </p>
          <p>
            The static edition of this site on GitHub Pages sends these events only when a server edition is configured to receive them. When none is configured, nothing leaves your browser.
          </p>
          <h2>Who processes data</h2>
          <p>
            The hosting provider and database provider chosen by the operator of this deployment, Stripe for billing, and, only when a workspace enables a live model, that model provider (Anthropic, OpenAI or Microsoft Azure OpenAI). Enterprise deployments run in the customer&apos;s own cloud subscription. The full list is on the{" "}
            <Link href="/security">security page</Link>.
          </p>
          <h2>Production data</h2>
          <p>Do not upload real customer data on the Sandbox plan. Production data is processed only under a signed data processing agreement.</p>
          <h2>Contact</h2>
          <p>
            <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
          </p>
        </div>
      </div>
    </>
  );
}
