import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { AppNav } from "@/components/app/AppNav";
import { WorkbenchShell } from "@/components/app/WorkbenchShell";
import { PLANS } from "@/lib/plans";
import { sidebarCounts } from "@/lib/queries";
import { requireTenant } from "@/lib/tenant";
import { endDemo, restartDemo } from "../demo-action";
import { signOutAction } from "./actions";
import "./app.css";

export const metadata: Metadata = { title: "Workbench", robots: { index: false } };

function hoursUntil(d: Date): number {
  return Math.max(0, Math.round((d.getTime() - Date.now()) / 3_600_000));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await requireTenant();
  const counts = await sidebarCounts(t.db, t.ws.id);
  const hoursLeft = t.ws.expiresAt ? hoursUntil(t.ws.expiresAt) : null;

  return (
    <div className="app">
      <aside className="app-side">
        <Link href="/" className="app-side__brand" aria-label="Assay home">
          <Wordmark size={19} />
        </Link>
        <div className="app-side__ws">
          <strong>{t.ws.name}</strong>
          <span>
            {t.mode === "demo" ? "Demo workspace" : `${PLANS[t.ws.plan].name} plan`}, policy v{t.ws.settings.version}
          </span>
        </div>
        <AppNav counts={counts} />
        <div className="app-side__foot">
          <span>Signed in as {t.actor}</span>
          {t.mode === "user" ? (
            <form action={signOutAction}>
              <button className="linklike" type="submit">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/sign-up">Create an account</Link>
          )}
        </div>
      </aside>
      <div className="app-main">
        {t.mode === "demo" && (
          <div className="demo-bar" role="status">
            <span>
              Demo workspace with synthetic data. Everything you do here is real and recorded in this workspace&apos;s audit log. It expires in {hoursLeft} hours.
            </span>
            <form action={endDemo}>
              <button className="linklike" type="submit">
                Exit demo
              </button>
            </form>
            <form action={restartDemo}>
              <button className="linklike" type="submit">
                Start over
              </button>
            </form>
          </div>
        )}
        <div className="app-content">
          <WorkbenchShell>{children}</WorkbenchShell>
        </div>
      </div>
    </div>
  );
}
