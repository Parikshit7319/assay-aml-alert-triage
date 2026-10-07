import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { HEADLINE } from "./marketing-numbers";

/*
 * Shared renderer for the Open Graph and Twitter images. Built at build time
 * (the route files set dynamic = "force-static"), so it works with the static
 * export. Fonts come from the installed @fontsource package as WOFF, one of the
 * formats ImageResponse accepts; nothing is fetched from the network.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `${brand.name}: ${HEADLINE} An AI first-pass analyst for AML alerts.`;

const NAVY = "#0c1a33";
const ON_NAVY_2 = "#b3bfd4";
const HIGHLIGHT = "#f5dc6b";

const fontDir = join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-sans", "files");

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Epitrochoid rosette, the same family of curves as the site's Guilloche component, at lower resolution. */
function rosette(size: number, rings = 5, steps = 1400): string[] {
  const c = size / 2;
  const out: string[] = [];
  for (let i = 0; i < rings; i++) {
    const R = size * (0.18 + i * 0.045);
    const r = size * (0.035 + (i % 2) * 0.008);
    const d = size * (0.05 + i * 0.012);
    for (let p = 0; p < 2; p++) {
      const phase = (p * Math.PI) / 18 + i * 0.21;
      const k = (R + r) / r;
      const turns = r / gcd(Math.round(R), Math.round(r));
      const tMax = Math.PI * 2 * Math.min(turns, 10);
      let path = "";
      for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * tMax;
        const x = c + (R + r) * Math.cos(t + phase) - d * Math.cos(k * t + phase);
        const y = c + (R + r) * Math.sin(t + phase) - d * Math.sin(k * t + phase);
        path += `${s ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      out.push(path);
    }
  }
  return out;
}

/** Horizontal wave band, like the footer's guilloche band. */
function band(width: number, height: number): string[] {
  const lines: string[] = [];
  for (let j = 0; j < 7; j++) {
    let d = "";
    for (let x = 0; x <= width; x += 6) {
      const y = height / 2 + Math.sin(x / 38 + j * 0.7) * (height * 0.32) * Math.cos(x / 210 + j * 0.35);
      d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    lines.push(d);
  }
  return lines;
}

export async function renderOgCard(): Promise<ImageResponse> {
  const [regular, semibold] = await Promise.all([
    readFile(join(fontDir, "ibm-plex-sans-latin-400-normal.woff")),
    readFile(join(fontDir, "ibm-plex-sans-latin-600-normal.woff")),
  ]);
  const ROS = 780;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "62px 72px 66px",
          background: NAVY,
          color: "#ffffff",
          fontFamily: "Plex",
          position: "relative",
        }}
      >
        <svg width={ROS} height={ROS} viewBox={`0 0 ${ROS} ${ROS}`} style={{ position: "absolute", top: -230, right: -230 }}>
          {rosette(ROS).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.085)" strokeWidth={0.9} />
          ))}
        </svg>
        <svg width={1200} height={90} viewBox="0 0 1200 90" style={{ position: "absolute", left: 0, bottom: 0 }}>
          {band(1200, 90).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={0.9} />
          ))}
        </svg>

        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width={58} height={58} viewBox="0 0 32 32">
            <rect x="1" y="1" width="30" height="30" rx="8" fill="#1d3c8c" />
            <path d="M9.2 24.5 16 7.5l6.8 17" fill="none" stroke="#ffffff" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="10.4" y="16.6" width="11.2" height="3.6" rx="1.2" fill={HIGHLIGHT} />
          </svg>
          <div style={{ marginLeft: 18, fontSize: 44, fontWeight: 600, letterSpacing: -1 }}>{brand.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", maxWidth: 940, fontSize: 66, fontWeight: 600, lineHeight: 1.07, letterSpacing: -1.6 }}>{HEADLINE}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
            <div style={{ width: 44, height: 8, borderRadius: 2, background: HIGHLIGHT, marginRight: 18 }} />
            <div style={{ fontSize: 28, fontWeight: 400, color: ON_NAVY_2 }}>AI first-pass analyst for AML alerts</div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Plex", data: regular, weight: 400, style: "normal" },
        { name: "Plex", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
