import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 28 }}>Nothing at this address</h1>
      <p style={{ margin: "12px 0 20px", color: "var(--ink-2)" }}>The page may have moved, or a demo workspace may have expired after 24 hours.</p>
      <Link className="btn" href="/">
        Go to the home page
      </Link>
    </main>
  );
}
