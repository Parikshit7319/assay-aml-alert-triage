import { startDemo } from "@/app/demo-action";

/** Server edition: POSTs to create a private demo workspace. The static edition swaps in DemoButton.static.tsx. */
export function DemoButton({ className = "btn", label = "Open the demo", full = false }: { className?: string; label?: string; full?: boolean }) {
  return (
    <form action={startDemo} style={{ margin: 0 }}>
      <button className={className} type="submit" style={full ? { width: "100%" } : undefined}>
        {label}
      </button>
    </form>
  );
}
