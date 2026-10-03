import type { Metadata } from "next";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };

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
          </ul>
          <h2>Demo workspaces</h2>
          <p>The public demo uses synthetic data only. Each demo workspace is tied to a browser cookie and deleted after 24 hours.</p>
          <h2>Cookies</h2>
          <p>A session cookie when you sign in, and a demo cookie when you open the demo. No advertising or cross-site tracking cookies.</p>
          <h2>Who processes data</h2>
          <p>
            The hosting provider and database provider chosen by the operator of this deployment, Stripe for billing, and, only when a workspace enables a live model, that model provider (Anthropic, OpenAI or Microsoft Azure OpenAI). Enterprise deployments run in the customer&apos;s own cloud subscription.
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
