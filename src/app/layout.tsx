import type { Metadata, Viewport } from "next";
import "@fontsource-variable/public-sans";
import "./globals.css";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: `${brand.name}: ${brand.tagline}`, template: `%s | ${brand.name}` },
  description: brand.description,
  openGraph: { title: `${brand.name}: ${brand.tagline}`, description: brand.description, type: "website" },
};

export const viewport: Viewport = { themeColor: "#f1f4ef" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
