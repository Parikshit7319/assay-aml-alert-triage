import type { MetadataRoute } from "next";
import { POSTS } from "./(site)/insights/posts";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const pages = [
    "",
    "/product",
    "/governance",
    "/pricing",
    "/developers",
    "/pilot",
    "/about",
    "/sources",
    "/privacy",
    "/for/bsa-officers",
    "/for/analyst-leads",
    "/for/model-risk",
    "/day-in-the-queue",
    "/security",
    "/integrations",
    "/insights",
  ].map((p) => ({ url: `${base}${p}` }));
  const posts = POSTS.map((p) => ({ url: `${base}/insights/${p.slug}`, lastModified: p.date }));
  return [...pages, ...posts];
}
