"use client";

import { useActionState } from "react";
import { importCsvAction, type ActionState } from "@/app/app/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(importCsvAction, {});
  return (
    <form action={action} className="form-stack">
      <label className="field">
        <span>CSV file</span>
        <input type="file" name="file" accept=".csv,text/csv" required />
        <small>Data stays in this workspace. Use test or synthetic data until a data agreement is in place.</small>
      </label>
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Importing and triaging" : "Import and triage"}
        </button>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="form-ok">{state.ok}</p>}
    </form>
  );
}
