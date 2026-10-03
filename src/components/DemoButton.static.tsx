import Link from "next/link";

/** Static edition: the demo runs entirely in the browser at /demo/. */
export function DemoButton({ className = "btn", label = "Open the demo", full = false }: { className?: string; label?: string; full?: boolean }) {
  return (
    <Link className={className} href="/demo/" style={full ? { width: "100%" } : undefined}>
      {label}
    </Link>
  );
}
