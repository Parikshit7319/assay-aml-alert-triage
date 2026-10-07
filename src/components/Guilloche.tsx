/**
 * Guilloche rosette, the fine interlaced linework printed on banknotes and
 * cheques to resist forgery. Generated from epitrochoid curves at build time.
 */
function curve(R: number, r: number, d: number, phase: number, cx: number, cy: number, steps = 900): string {
  const k = (R + r) / r;
  const turns = r / gcd(Math.round(R), Math.round(r));
  const tMax = Math.PI * 2 * turns;
  let out = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * tMax;
    const x = cx + (R + r) * Math.cos(t + phase) - d * Math.cos(k * t + phase);
    const y = cy + (R + r) * Math.sin(t + phase) - d * Math.sin(k * t + phase);
    out += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return out;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export function Guilloche({
  size = 640,
  rings = 5,
  stroke = "rgba(255,255,255,0.09)",
  className,
  style,
}: {
  size?: number;
  rings?: number;
  stroke?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = size / 2;
  const paths: string[] = [];
  for (let i = 0; i < rings; i++) {
    const R = size * (0.18 + i * 0.045);
    const r = size * (0.035 + (i % 2) * 0.008);
    const d = size * (0.05 + i * 0.012);
    for (let p = 0; p < 3; p++) paths.push(curve(R, r, d, (p * Math.PI) / 18 + i * 0.21, c, c));
  }
  return (
    <svg className={className} style={style} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={0.75} />
      ))}
    </svg>
  );
}

/** A horizontal guilloche band, used as a divider on dark sections and in the footer. */
export function GuillocheBand({ width = 1200, height = 120, stroke = "rgba(255,255,255,0.08)", className }: { width?: number; height?: number; stroke?: string; className?: string }) {
  const lines: string[] = [];
  for (let j = 0; j < 9; j++) {
    let d = "";
    for (let x = 0; x <= width; x += 4) {
      const y = height / 2 + Math.sin(x / 38 + j * 0.7) * (height * 0.32) * Math.cos(x / 210 + j * 0.35);
      d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
    }
    lines.push(d);
  }
  return (
    <svg className={className} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={0.8} />
      ))}
    </svg>
  );
}
