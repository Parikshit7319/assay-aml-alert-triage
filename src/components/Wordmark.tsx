import { brand } from "@/lib/brand";

/** Wordmark: the name beside a small hallmark, the stamp an assay office strikes on tested metal. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <svg width={size * 0.95} height={size * 0.95} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 1h12l5 5v12l-5 5H6l-5-5V6z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M7.5 16.5 12 6.5l4.5 10M9.2 12.8h5.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}
