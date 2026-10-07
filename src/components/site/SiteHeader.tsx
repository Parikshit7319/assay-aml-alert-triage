"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";

const SOLUTIONS = [
  { href: "/for/bsa-officers", label: "For BSA officers", note: "Clear the noise without losing the audit trail" },
  { href: "/for/analyst-leads", label: "For analyst team leads", note: "Queues, QA sampling and workload in one place" },
  { href: "/for/model-risk", label: "For model risk", note: "Every decision traceable to a model and policy version" },
  { href: "/day-in-the-queue", label: "A day in the queue", note: "One analyst shift, before and after" },
];

const NAV = [
  { href: "/product", label: "Product" },
  { href: "/integrations", label: "Integrations" },
  { href: "/security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
  { href: "/insights", label: "Insights" },
];

export function SiteHeader({ signInHref, demoSlot }: { signInHref: string | null; demoSlot: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [solutions, setSolutions] = useState(false);
  useEffect(() => {
    setOpen(false);
    setSolutions(false);
  }, [path]);
  const active = (href: string) => path?.replace(/\/$/, "") === href.replace(/\/$/, "") || path?.startsWith(href);

  return (
    <header className={`sh${open ? " sh--open" : ""}`}>
      <div className="wrap sh__inner">
        <Link href="/" className="sh__brand" aria-label="Assay home">
          <Wordmark size={21} />
        </Link>
        <nav className="sh__nav" aria-label="Main">
          <Link href="/product" aria-current={active("/product") ? "page" : undefined}>
            Product
          </Link>
          <div className="sh__menu" onMouseLeave={() => setSolutions(false)}>
            <button type="button" aria-expanded={solutions} aria-controls="sh-solutions" onClick={() => setSolutions((v) => !v)} onMouseEnter={() => setSolutions(true)}>
              Solutions
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <div id="sh-solutions" className="sh__panel" hidden={!solutions}>
              {SOLUTIONS.map((s) => (
                <Link key={s.href} href={s.href}>
                  <b>{s.label}</b>
                  <span>{s.note}</span>
                </Link>
              ))}
            </div>
          </div>
          {NAV.slice(1).map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sh__actions">
          {signInHref && (
            <Link href={signInHref} className="sh__signin">
              Sign in
            </Link>
          )}
          {demoSlot}
          <button type="button" className="sh__toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              {open ? (
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="sh__mobile" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
          <span className="sh__mobile-label">Solutions</span>
          {SOLUTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              {s.label}
            </Link>
          ))}
          <Link href="/about/">About</Link>
          {signInHref && <Link href={signInHref}>Sign in</Link>}
        </nav>
      )}
    </header>
  );
}
