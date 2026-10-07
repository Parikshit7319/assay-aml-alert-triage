import { DemoButton } from "@/components/DemoButton";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Analytics } from "@/components/site/Analytics";
import { Reveal } from "@/components/site/Reveal";
import { STATIC_SITE } from "@/lib/site-mode";
import "./site.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <SiteHeader signInHref={STATIC_SITE ? null : "/sign-in"} demoSlot={<DemoButton className="btn btn-small" label="Try the live demo" />} />
      <main id="main">{children}</main>
      <SiteFooter />
      <Reveal />
      <Analytics />
    </>
  );
}
