"use client";

import { useActionState, useEffect } from "react";
import { pilotAction, type FormState } from "@/app/(site)/auth-actions";
import { track } from "@/lib/analytics-client";

export function PilotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(pilotAction, {});
  useEffect(() => {
    if (state.ok) track("pilot_submit");
  }, [state.ok]);
  if (state.ok)
    return (
      <div role="status" aria-live="polite">
        <p className="form-ok">{state.ok}</p>
      </div>
    );
  return (
    <form action={action} className="lead-form">
      <div className="row">
        <label className="field">
          <span>Name</span>
          <input type="text" name="name" autoComplete="name" required />
        </label>
        <label className="field">
          <span>Work email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Company</span>
          <input type="text" name="company" autoComplete="organization" required />
        </label>
        <label className="field">
          <span>Role</span>
          <input type="text" name="role" placeholder="BSA officer, AML manager, ..." />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Type of institution</span>
          <select name="segment" defaultValue="">
            <option value="">Choose one</option>
            <option>Fintech or payments company</option>
            <option>Money services business</option>
            <option>Sponsor bank (BaaS program)</option>
            <option>Bank</option>
            <option>Credit union</option>
            <option>Crypto exchange</option>
            <option>Broker-dealer or asset manager</option>
            <option>Other</option>
          </select>
        </label>
        <label className="field">
          <span>Alerts per month, roughly</span>
          <input type="number" name="monthlyAlerts" min={0} step={100} />
        </label>
      </div>
      <label className="field">
        <span>Monitoring system</span>
        <input type="text" name="monitoringSystem" placeholder="For example: NICE Actimize, Unit21, in-house rules" />
      </label>
      <label className="field">
        <span>What would make a pilot worth it?</span>
        <textarea name="message" rows={4} />
      </label>
      <label className="visually-hidden" aria-hidden="true">
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div role="status" aria-live="polite">
        {state.error && <p className="form-error">{state.error}</p>}
      </div>
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Sending" : "Request a pilot"}
        </button>
      </div>
    </form>
  );
}
