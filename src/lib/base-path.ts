/** Prefix for static assets referenced by raw <img>/<video> tags (next/link handles routes itself). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBase(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  return `${BASE_PATH}${src.startsWith("/") ? src : `/${src}`}`;
}
