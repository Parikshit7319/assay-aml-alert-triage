import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { brand } from "@/lib/brand";
import { DemoButton } from "@/components/DemoButton";
import { REPO_URL, STATIC_SITE } from "@/lib/site-mode";
import "./site.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-header__inner">
          <Link href="/" className="site-header__brand" aria-label={`${brand.name} home`}>
            <Wordmark />
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link href="/product">Product</Link>
            <Link href="/governance">Governance</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/about">About</Link>
          </nav>
          <div className="site-header__actions">
            {STATIC_SITE ? (
              <a href={REPO_URL} className="btn btn-quiet">
                Code on GitHub
              </a>
            ) : (
              <Link href="/sign-in" className="btn btn-quiet">
                Sign in
              </Link>
            )}
            <DemoButton className="btn btn-small" />
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="wrap site-footer__inner">
          <div className="site-footer__brand">
            <Wordmark size={18} />
            <p>{brand.tagline}.</p>
            <p className="site-footer__fine">
              {brand.name} is a working name. The demo uses synthetic data only: every person, business and watchlist entry in it is invented.
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer__links">
            <div>
              <h2>Product</h2>
              <Link href="/product">How it works</Link>
              <Link href="/governance">Governance</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/developers">API</Link>
            </div>
            <div>
              <h2>Company</h2>
              <Link href="/about">About</Link>
              <Link href="/pilot">Request a pilot</Link>
              <Link href="/sources">Sources</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </nav>
        </div>
      </footer>
    </>
  );
}
