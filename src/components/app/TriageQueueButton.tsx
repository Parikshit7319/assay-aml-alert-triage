"use client";

import { useActionState } from "react";
import { triageQueueAction, type ActionState } from "@/app/app/actions";

export function TriageQueueButton({ count }: { count: number }) {
  const [state, action, pending] = useActionState<ActionState>(triageQueueAction, {});
  return (
    <form action={action} style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Triaging" : `Triage ${count} new alert${count === 1 ? "" : "s"}`}
      </button>
      {state.error && <span className="form-error">{state.error}</span>}
      {state.ok && <span className="form-ok">{state.ok}</span>}
    </form>
  );
}
