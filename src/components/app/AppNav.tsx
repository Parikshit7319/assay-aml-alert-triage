"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/app", label: "Alert queue", count: "open" as const },
  { href: "/app/l2", label: "L2 investigations", count: "l2" as const },
  { href: "/app/qa", label: "QA review", count: "qa" as const },
  { href: "/app/customers", label: "Customers" },
  { href: "/app/team", label: "Team" },
  { href: "/app/metrics", label: "Metrics" },
  { href: "/app/shadow", label: "Shadow mode" },
  { href: "/app/audit", label: "Audit log" },
];
const ADMIN = [
  { href: "/app/import", label: "Import alerts" },
  { href: "/app/settings", label: "Policy and autonomy" },
  { href: "/app/developers", label: "API keys" },
  { href: "/app/billing", label: "Plan and usage" },
];

export function AppNav({ counts }: { counts: { open: number; l2: number; qa: number } }) {
  const path = usePathname();
  const isCurrent = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/alerts") : path.startsWith(href));
  return (
    <nav className="app-nav" aria-label="Workbench">
      {MAIN.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isCurrent(l.href) ? "page" : undefined}>
          {l.label}
          {l.count && counts[l.count] > 0 ? <span className="count">{counts[l.count]}</span> : null}
        </Link>
      ))}
      <span className="app-nav__label">Workspace</span>
      {ADMIN.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isCurrent(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
