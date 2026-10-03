"use client";

import { useActionState } from "react";
import { renameWorkspaceAction, type ActionState } from "@/app/app/actions";

export function RenameForm({ name, disabled }: { name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renameWorkspaceAction, {});
  return (
    <form action={action} className="form-stack">
      <label className="field">
        <span>Workspace name</span>
        <input type="text" name="name" defaultValue={name} disabled={disabled} maxLength={80} />
      </label>
      <div>
        <button className="btn btn-outline btn-small" type="submit" disabled={disabled || pending}>
          Rename
        </button>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      {state.ok && <p className="form-ok">{state.ok}</p>}
    </form>
  );
}
