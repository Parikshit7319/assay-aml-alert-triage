import type { Metadata } from "next";
import Link from "next/link";
import { ApiDocs } from "@/components/ApiDocs";

export const metadata: Metadata = { title: "API", description: "Send alerts as they fire and read recommendations back into your case manager." };

export default function DevelopersPage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <h1>API</h1>
          <p>Send alerts from your monitoring system as they fire, and write the recommendation, citations and policy results back into your case manager.</p>
        </div>
      </header>
      <div className="wrap page-body two-col">
        <ApiDocs />
        <aside className="aside-box">
          <h2>Get a key</h2>
          <p>Create a workspace, upgrade to Team, then create keys under API keys in the workbench.</p>
          <Link className="btn" href="/sign-up" style={{ width: "100%" }}>
            Create a workspace
          </Link>
        </aside>
      </div>
    </>
  );
}
