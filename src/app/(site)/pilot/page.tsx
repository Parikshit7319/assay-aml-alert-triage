import type { Metadata } from "next";
import { PilotForm } from "@/components/PilotForm";

export const metadata: Metadata = { title: "Request a pilot", description: "A shadow-mode pilot on your historical alerts, measured against your own QA." };

export default function PilotPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>Request a pilot</h1>
          <p>The pilot starts in shadow mode on historical alerts you have already decided, so the first result is a measured agreement rate on your own data, with no change to your live process.</p>
        </div>
      </header>
      <div className="wrap page-body two-col">
        <PilotForm />
        <aside className="aside-box">
          <h2>How a pilot runs</h2>
          <ol style={{ margin: "0 0 12px", paddingLeft: 18, display: "grid", gap: 8, fontSize: 14.5, color: "var(--ink-2)" }}>
            <li>Scoping call and data agreement. Pick two or three alert types.</li>
            <li>Weeks 1 to 6: shadow mode on 2,000 to 5,000 decided alerts. We report agreement by alert type against your dispositions.</li>
            <li>Weeks 6 to 12: assisted review on live alerts, randomized against a control group, measuring hours per confirmed case and missed escalations.</li>
            <li>A written result either way, including where it did not work.</li>
          </ol>
          <p style={{ margin: 0 }}>Best fit: teams working 1,000 or more alerts a month with an existing QA process.</p>
        </aside>
      </div>
    </>
  );
}
