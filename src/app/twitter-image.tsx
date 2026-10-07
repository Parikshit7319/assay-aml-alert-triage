import { OG_ALT, OG_SIZE, renderOgCard } from "@/components/site/OgCard";

// Prerendered at build time so it ships in the static export.
export const dynamic = "force-static";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderOgCard();
}
