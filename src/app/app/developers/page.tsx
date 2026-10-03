import { and, desc, eq, isNull } from "drizzle-orm";
import { ApiDocs } from "@/components/ApiDocs";
import { ApiKeyForms } from "@/components/app/ApiKeyForms";
import { apiKeys } from "@/lib/db/schema";
import { fmtDateTime } from "@/lib/labels";
import { PLANS } from "@/lib/plans";
import { canAdminister, requireTenant } from "@/lib/tenant";

export default async function DevelopersPage() {
  const t = await requireTenant();
  const keys = await t.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, t.ws.id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
  const allowed = PLANS[t.ws.plan].apiAccess && t.mode !== "demo";
  return (
    <>
      <div className="app-head">
        <div>
          <h1>API keys</h1>
          <p>Send alerts from your monitoring system as they fire, and read results back into your case manager.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Reference</h2>
          </div>
          <div className="panel__body">
            <ApiDocs />
          </div>
        </section>
        <section className="panel">
          <div className="panel__head">
            <h2>Keys</h2>
            <span>{keys.length} active</span>
          </div>
          <div className="panel__body">
            {!allowed && (
              <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
                {t.mode === "demo" ? "API keys are disabled in the demo. Create an account to use the API." : "API access is part of the Team plan. Upgrade on the Plan and usage page."}
              </p>
            )}
            <ApiKeyForms
              keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: fmtDateTime(k.createdAt), lastUsedAt: k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : null }))}
              canCreate={allowed && canAdminister(t)}
            />
          </div>
        </section>
      </div>
    </>
  );
}
