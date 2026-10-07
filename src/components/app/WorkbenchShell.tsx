"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShortcutHelp } from "@/components/workbench/ShortcutHelp";
import { ToastProvider } from "@/components/workbench/Toasts";
import { useHotkeys } from "@/components/workbench/useHotkeys";

const GROUPS = [
  {
    title: "Queue",
    keys: [
      { combo: "j", label: "Next alert" },
      { combo: "k", label: "Previous alert" },
      { combo: "enter", label: "Open the highlighted alert" },
      { combo: "x", label: "Select for batch close" },
      { combo: "/", label: "Search the queue" },
    ],
  },
  {
    title: "Alert",
    keys: [
      { combo: "c", label: "Close (accept or override)" },
      { combo: "e", label: "Escalate to L2" },
      { combo: "o", label: "Choose an override reason" },
      { combo: "a", label: "Assign to me" },
      { combo: "n", label: "Write a note" },
      { combo: "j", label: "Next alert in the queue" },
      { combo: "k", label: "Previous alert" },
    ],
  },
  {
    title: "Anywhere",
    keys: [
      { combo: "g q", label: "Go to the queue" },
      { combo: "?", label: "Show this list" },
    ],
  },
];

function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useHotkeys({ "?": () => setOpen(true), "g q": () => router.push("/app") });
  return <ShortcutHelp open={open} onClose={() => setOpen(false)} groups={GROUPS} />;
}

/** Client shell for the server workbench: toasts plus global keyboard shortcuts. */
export function WorkbenchShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <Shortcuts />
    </ToastProvider>
  );
}
