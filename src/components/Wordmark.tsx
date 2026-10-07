import { brand } from "@/lib/brand";

/**
 * The mark: an "A" whose crossbar is a highlighter stroke, on a security-blue
 * seal. It reads at favicon size and carries the product idea: evidence, marked.
 */
export function LogoMark({ size = 28, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={inverse ? "#ffffff" : "#1d3c8c"} />
      <path d="M9.2 24.5 16 7.5l6.8 17" fill="none" stroke={inverse ? "#1d3c8c" : "#ffffff"} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="10.4" y="16.6" width="11.2" height="3.6" rx="1.2" fill="#f5dc6b" />
    </svg>
  );
}

export function Wordmark({ size = 22, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <span className={`wordmark${inverse ? " wordmark--inverse" : ""}`} style={{ fontSize: size }}>
      <LogoMark size={Math.round(size * 1.18)} inverse={inverse} />
      <span className="wordmark__text">{brand.name}</span>
    </span>
  );
}
