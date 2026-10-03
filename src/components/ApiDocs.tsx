const EXAMPLE = `curl -X POST https://YOUR-DEPLOYMENT/api/v1/alerts \\
  -H "Authorization: Bearer ask_..." \\
  -H "Content-Type: application/json" \\
  -d '{
  "alert": {
    "external_id": "TM-100231",
    "rule_code": "CASH-STRUCT-01",
    "rule_description": "Three or more cash deposits between $8,000 and $10,000 within 30 days",
    "created_at": "2026-10-03T14:00:00Z",
    "triggered_transaction_ids": ["TX-1", "TX-2", "TX-3"]
  },
  "customer": {
    "external_id": "CUST-55102",
    "name": "Sample Customer A",
    "type": "individual",
    "occupation": "Food truck owner",
    "onboarded_at": "2025-05-20T00:00:00Z",
    "expected_monthly_volume": 6000
  },
  "transactions": [
    { "external_id": "TX-1", "timestamp": "2026-09-24T10:00:00Z", "amount": 9200,
      "direction": "in", "channel": "cash", "location": "Main St location" }
  ]
}'`;

const RESPONSE = `{
  "results": [{
    "external_id": "TM-100231",
    "alert_id": "ALT-7Q2M4K",
    "status": "triaged",
    "recommendation": "escalate",
    "model_recommendation": "escalate",
    "confidence": 0.9,
    "risk_score": 78,
    "rationale": [
      { "claim": "4 cash deposits between $9,200 and $9,800 ...", "citations": ["TXN-8F3K2Q", "..."] }
    ],
    "policy_hits": [],
    "citations_valid": true,
    "run_id": "RUN-4H7P2M",
    "policy_version": 1,
    "url": "https://YOUR-DEPLOYMENT/app/alerts/ALT-7Q2M4K"
  }]
}`;

export function ApiDocs() {
  return (
    <div className="prose" style={{ maxWidth: "none" }}>
      <h3>Send an alert</h3>
      <p>
        <code>POST /api/v1/alerts</code> takes one alert with its customer and transactions, or <code>{"{ \"alerts\": [...] }"}</code> with up to 50. Each alert is stored, triaged, and returned with the recommendation. Re-sending an <code>external_id</code> already in the workspace returns <code>duplicate</code> and does not bill a run.
      </p>
      <pre>
        <code>{EXAMPLE}</code>
      </pre>
      <h3>Response</h3>
      <pre>
        <code>{RESPONSE}</code>
      </pre>
      <h3>Fetch a result</h3>
      <p>
        <code>GET /api/v1/alerts/ALT-7Q2M4K</code> returns the alert, its status, the latest run and every human decision.
      </p>
      <h3>Fields</h3>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Values</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>transactions[].direction</code>
            </td>
            <td>in, out</td>
          </tr>
          <tr>
            <td>
              <code>transactions[].channel</code>
            </td>
            <td>cash, wire, ach, p2p, card, check</td>
          </tr>
          <tr>
            <td>
              <code>alert.typology</code>
            </td>
            <td>structuring, funnel_account, high_risk_wire, sanctions_name, payroll_pattern, seasonal_cash, other. Inferred from the rule code when omitted.</td>
          </tr>
          <tr>
            <td>
              <code>customer.risk_rating</code>
            </td>
            <td>low, medium, high</td>
          </tr>
        </tbody>
      </table>
      <p>API access is part of the Team and Enterprise plans. Keys are stored as SHA-256 hashes and shown once at creation. Every call is metered and written to the audit log.</p>
    </div>
  );
}
