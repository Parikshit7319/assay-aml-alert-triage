"use client";

import { useActionState } from "react";
import { qaReviewAction, type ActionState } from "@/app/app/actions";

export function QaForm({ qaId }: { qaId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(qaReviewAction, {});
  return (
    <form action={action} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="qaId" value={qaId} />
      <input type="text" name="note" placeholder="Note (required to disagree)" aria-label="QA note" />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-close btn-small" name="result" value="agree" disabled={pending}>
          Agree
        </button>
        <button className="btn btn-outline btn-small" name="result" value="disagree" disabled={pending}>
          Disagree
        </button>
      </div>
      {state.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}
