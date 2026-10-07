import Link from "next/link";
import { PolicyForm } from "@/components/app/PolicyForm";
import { RenameForm } from "@/components/app/RenameForm";
import { WebhookForm } from "@/components/app/WebhookForm";
import { AUTONOMY_LEVELS, NEVER_AUTOMATED } from "@/lib/engine/policy";
import { liveProviderConfigured } from "@/lib/engine/providers";
import { PLANS } from "@/lib/plans";
import { canAdminister, requireTenant } from "@/lib/tenant";
import { DEFAULT_WEBHOOK_EVENTS, WEBHOOK_EVENTS, WEBHOOK_FORMATS } from "@/lib/webhooks";
import { removeWebhookAction, rotateWebhookSecretAction, saveWebhookAction, testWebhookAction } from "./webhook-actions";

export default async function SettingsPage() {
  const t = await requireTenant();
  const providers = {
    simulated: true,
    anthropic: liveProviderConfigured("anthropic"),
    openai: liveProviderConfigured("openai"),
    "azure-openai": liveProviderConfigured("azure-openai"),
  };
  const liveAllowed = t.mode !== "demo" && PLANS[t.ws.plan].liveModel;
  // The webhook URL and secret never go to the browser with the policy.
  const { webhook, ...policy } = t.ws.settings;
  const webhookEditable = t.mode !== "demo" && canAdminister(t);
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
            <PolicyForm settings={policy} providers={providers} liveAllowed={liveAllowed} canEdit={canAdminister(t)} />
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
          <section className="panel" id="webhook" aria-labelledby="webhook-h">
            <div className="panel__head">
              <h2 id="webhook-h">Outbound webhook</h2>
              <span>{webhook ? `${WEBHOOK_FORMATS.find((f) => f.id === webhook.format)?.label ?? webhook.format}, ${webhook.events.length} event${webhook.events.length === 1 ? "" : "s"}` : "Off"}</span>
            </div>
            <div className="panel__body">
              <p className="decide__hint" style={{ marginTop: 0 }}>
                Posts escalations, closes, SAR decisions, assignments and mentions to your case system, Slack or Teams after each action. Every delivery and failure is written to the audit log. Payload reference on the{" "}
                <Link href="/integrations#webhooks">integrations page</Link>.
              </p>
              <WebhookForm
                current={webhook ? { url: webhook.url, format: webhook.format, events: webhook.events, secretHint: webhook.secret ? webhook.secret.slice(-4) : null } : null}
                events={WEBHOOK_EVENTS}
                formats={WEBHOOK_FORMATS}
                defaultEvents={DEFAULT_WEBHOOK_EVENTS}
                canEdit={webhookEditable}
                disabledReason={t.mode === "demo" ? "Webhooks are off in the demo workspace. Create an account to send events to your own endpoint." : "Only workspace owners and admins can change the webhook."}
                actions={{ save: saveWebhookAction, rotate: rotateWebhookSecretAction, test: testWebhookAction, remove: removeWebhookAction }}
              />
            </div>
          </section>
          <section className="panel">
            <div className="panel__head">
              <h2>Documentation for review</h2>
            </div>
            <div className="panel__body">
              <ul className="cases">
                <li>
                  <a href="/app/export/model-risk">Model risk documentation pack</a>
                  <span>Purpose, inputs, method, these controls at v{t.ws.settings.version}, run outcomes and agreement by alert type. Opens print-ready; save as PDF from the print dialog.</span>
                </li>
                <li>
                  <a href="/app/export/decisions.csv">Decisions (CSV)</a>
                  <span>Every analyst, batch, auto-close and SAR decision with reason codes and whether it agreed with the agent.</span>
                </li>
                <li>
                  <a href="/app/export/qa.csv">QA reviews (CSV)</a>
                  <span>Sampled closes, the agent&apos;s recommendation, the decision and the QA result.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
