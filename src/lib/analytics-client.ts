import { API_BASE, STATIC_SITE } from "@/lib/site-mode";

export type TrackEvent = "pageview" | "click" | "demo_start" | "demo_action" | "pilot_submit" | "signup";

function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return nav.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true;
}

/** Endpoint for the beacon, or null when there is nowhere to send it (static build with no server). */
export function trackEndpoint(): string | null {
  if (STATIC_SITE && !API_BASE) return null;
  return `${API_BASE}/api/track`;
}

export function track(event: TrackEvent, props: { path?: string; label?: string } = {}): void {
  if (typeof window === "undefined" || optedOut()) return;
  const url = trackEndpoint();
  if (!url) return;
  const body = JSON.stringify({
    event,
    path: (props.path ?? location.pathname).slice(0, 200),
    label: props.label?.slice(0, 80),
    referrer: document.referrer ? safeHost(document.referrer) : null,
    w: window.innerWidth,
  });
  try {
    const blob = new Blob([body], { type: "text/plain" });
    if (!navigator.sendBeacon?.(url, blob)) {
      void fetch(url, { method: "POST", body, keepalive: true, mode: "cors", headers: { "content-type": "text/plain" } }).catch(() => {});
    }
  } catch {
    /* analytics must never break the page */
  }
}

function safeHost(u: string): string | null {
  try {
    const h = new URL(u).host;
    return h === location.host ? null : h;
  } catch {
    return null;
  }
}
