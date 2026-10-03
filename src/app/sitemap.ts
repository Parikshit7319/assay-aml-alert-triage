import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ["", "/product", "/governance", "/pricing", "/developers", "/pilot", "/about", "/sources", "/privacy"].map((p) => ({ url: `${base}${p}` }));
}
