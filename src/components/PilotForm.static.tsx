"use client";

import { useState, type FormEvent } from "react";
import { track } from "@/lib/analytics-client";
import { brand } from "@/lib/brand";
import { API_BASE } from "@/lib/site-mode";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; message: string } | { kind: "error"; message: string } | { kind: "mailto" };

const THANKS = "Thanks. I will reply within two business days with a short scoping call.";

function read(form: HTMLFormElement) {
  const fd = new FormData(form);
  const s = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
  return {
    name: s("name"),
    email: s("email"),
    company: s("company"),
    role: s("role"),
    segment: s("segment"),
    monthlyAlerts: s("monthlyAlerts"),
    monitoringSystem: s("monitoringSystem"),
    message: s("message"),
    website: s("website"),
  };
}

function mailtoHref(v: ReturnType<typeof read>): string {
  const body = [
    `Name: ${v.name}`,
    `Work email: ${v.email}`,
    `Company: ${v.company}`,
    `Role: ${v.role}`,
    `Type of institution: ${v.segment}`,
    `Alerts per month (roughly): ${v.monthlyAlerts}`,
    `Monitoring system: ${v.monitoringSystem}`,
    "",
    "What would make a pilot worth it?",
    v.message,
  ].join("\n");
  return `mailto:${brand.contactEmail}?subject=${encodeURIComponent(`Assay pilot request: ${v.company || v.name}`)}&body=${encodeURIComponent(body)}`;
}

function CopyEmail() {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(brand.contactEmail);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>
      <button className="btn btn-outline btn-small" type="button" onClick={copy}>
        Copy address
      </button>
      <span aria-live="polite" className="decide__hint">
        {copied === "copied" ? "Copied." : copied === "failed" ? "Could not copy; select the address instead." : ""}
      </span>
    </span>
  );
}

/**
 * Static edition of the pilot form. With a server deployed (API_BASE set) it
 * posts to /api/leads on that server. Without one it opens your email app with
 * the request filled in, and shows the address to copy in case nothing opens.
 * Fields match the server edition's form exactly.
 */
export function PilotForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const hasServer = !!API_BASE;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = read(e.currentTarget);
    if (v.website) {
      setStatus({ kind: "sent", message: THANKS });
      return;
    }
    if (!hasServer) {
      track("pilot_submit", { label: "mailto" });
      setStatus({ kind: "mailto" });
      window.location.href = mailtoHref(v);
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const res = await fetch(`${API_BASE}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: v.name,
          email: v.email,
          company: v.company,
          role: v.role,
          segment: v.segment,
          alerts_per_month: v.monthlyAlerts,
          monitoring_system: v.monitoringSystem,
          message: v.message,
          website: v.website,
        }),
        mode: "cors",
        credentials: "omit",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        track("pilot_submit");
        setStatus({ kind: "sent", message: data.message || THANKS });
      } else {
        setStatus({ kind: "error", message: data.error || "The request did not go through." });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server." });
    }
  }

  if (status.kind === "sent") {
    return (
      <div role="status" aria-live="polite">
        <p className="form-ok">{status.message}</p>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={onSubmit}>
      {!hasServer && (
        <p className="decide__hint" style={{ margin: 0 }}>
          This copy of the site has no server behind it. Sending opens your email app with the request filled in, addressed to {brand.contactEmail}.
        </p>
      )}
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
        {status.kind === "error" && (
          <p className="form-error">
            {status.message} Email the request to <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a> instead.
          </p>
        )}
        {status.kind === "mailto" && (
          <p className="form-ok" style={{ margin: 0 }}>
            Your email app should open with the request filled in. Send it from there. If nothing opened, copy the address below and paste the details into a new email.
          </p>
        )}
      </div>
      <div>
        <button className="btn" type="submit" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending" : hasServer ? "Request a pilot" : "Email the request"}
        </button>
      </div>
      <p className="decide__hint" style={{ margin: 0 }}>
        Or write directly: <CopyEmail />
      </p>
    </form>
  );
}
