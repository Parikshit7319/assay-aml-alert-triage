import { PolicyForm } from "@/components/app/PolicyForm";
import { RenameForm } from "@/components/app/RenameForm";
import { AUTONOMY_LEVELS, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { liveProviderConfigured } from "@/lib/engine/providers";
import { PLANS } from "@/lib/plans";
import { canAdminister, requireTenant } from "@/lib/tenant";

export default async function SettingsPage() {
  const t = await requireTenant();
  const providers = {
    simulated: true,
    anthropic: liveProviderConfigured("anthropic"),
    openai: liveProviderConfigured("openai"),
    "azure-openai": liveProviderConfigured("azure-openai"),
  };
  const liveAllowed = t.mode !== "demo" && PLANS[t.ws.plan].liveModel;
  return (
    <>
      <div className="app-head">
        <div>
          <h1>Policy and autonomy</h1>
          <p>
            Every change creates a new policy version. Runs record the version they used, so any past recommendation can be explained by the rules in force at the time. This workspace is on v{t.ws.settings.version}.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Rules the agent works under</h2>
            <span>v{t.ws.settings.version}</span>
          </div>
          <div className="panel__body">
            <PolicyForm settings={t.ws.settings} providers={providers} liveAllowed={liveAllowed} canEdit={canAdminister(t)} />
          </div>
        </section>
        <div className="facts">
          <section className="panel">
            <div className="panel__head">
              <h2>Autonomy levels</h2>
            </div>
            <div className="panel__body">
              <ul className="cases">
                {AUTONOMY_LEVELS.map((l) => (
                  <li key={l.level}>
                    <b>
                      L{l.level} {l.name}
                    </b>
                    <span>{l.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="panel" style={{ borderColor: "var(--red)" }}>
            <div className="panel__head">
              <h2 style={{ color: "var(--red)" }}>Not configurable</h2>
            </div>
            <div className="panel__body">
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>
                {NEVER_AUTOMATED.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </section>
          <section className="panel">
            <div className="panel__head">
              <h2>Workspace</h2>
            </div>
            <div className="panel__body">
              <RenameForm name={t.ws.name} disabled={!canAdminister(t)} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
