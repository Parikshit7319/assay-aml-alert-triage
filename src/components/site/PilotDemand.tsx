"use client";

import { useEffect, useState } from "react";
import { API_BASE, STATIC_SITE } from "@/lib/site-mode";

/**
 * Real demand, or nothing. Reads the count of pilot requests from the server
 * edition's public stats endpoint and only shows it once there are at least
 * three. With no server to ask, the fallback line stays.
 */
export function PilotDemand({ initial, fallback }: { initial: number | null; fallback: React.ReactNode }) {
  const [count, setCount] = useState<number | null>(initial);
  useEffect(() => {
    if (initial != null || (STATIC_SITE && !API_BASE)) return;
    const ac = new AbortController();
    fetch(`${API_BASE}/api/public/stats`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { pilotRequests?: number } | null) => {
        if (j && typeof j.pilotRequests === "number") setCount(j.pilotRequests);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [initial]);
  if (count != null && count >= 3) return <p className="c-dp__demand">{count} teams have requested a pilot.</p>;
  return <>{fallback}</>;
}
