import { brand } from "@/lib/brand";

/** Static edition: no server to receive the form, so the request goes by email. */
export function PilotForm() {
  const body = encodeURIComponent(
    "Name:\nCompany:\nRole:\nType of institution:\nAlerts per month (roughly):\nMonitoring system:\nWhat would make a pilot worth it?\n",
  );
  return (
    <div className="lead-form">
      <p style={{ fontSize: 17 }}>Send a short note with your company, role, rough alert volume and monitoring system. A reply comes within two business days.</p>
      <div>
        <a className="btn" href={`mailto:${brand.contactEmail}?subject=${encodeURIComponent("Assay pilot request")}&body=${body}`}>
          Email a pilot request
        </a>
      </div>
      <p className="decide__hint">
        Or write to <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.
      </p>
    </div>
  );
}
