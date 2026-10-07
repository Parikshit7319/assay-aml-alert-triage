"use client";

import { useEffect, useState } from "react";

export interface StoryItem {
  id: string;
  n: string;
  label: string;
}

/**
 * Sticky chapter list for a scroll story. The chapter crossing a band near the
 * top third of the viewport is marked aria-current="true". The nav element is
 * the grid item itself so position: sticky has the whole story to travel in.
 */
export function StoryNav({ items, label = "Chapters" }: { items: StoryItem[]; label?: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const inBand = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        const first = items.find((i) => inBand.has(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-28% 0px -62% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className="story__nav m-story-nav" aria-label={label}>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "true" : undefined} onClick={() => setActive(i.id)}>
          <b>{i.n}</b>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
