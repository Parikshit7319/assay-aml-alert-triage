"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/analytics-client";

/**
 * First-party page-view beacon. No cookies, no third parties, no IP stored:
 * the server keeps path, referrer host, a coarse device class and a daily
 * visitor hash it cannot reverse. Honors Do Not Track and Global Privacy Control.
 */
export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    track("pageview", { path: path ?? "/" });
  }, [path]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-track]");
      if (el) track("click", { path: location.pathname, label: el.dataset.track ?? "" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
