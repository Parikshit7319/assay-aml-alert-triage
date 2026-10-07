/** Open Graph image for pages that set their own openGraph block (which replaces the inherited one). */
const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const OG_IMAGES = [{ url: `${base}/opengraph-image`, width: 1200, height: 630, alt: "Assay: an AI first-pass analyst for AML alerts" }];
