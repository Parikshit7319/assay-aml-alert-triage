"use client";

import { useActionState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type ActionState } from "@/app/app/actions";

interface Key {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function Revoke({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(revokeApiKeyAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="keyId" value={id} />
      <button className="btn btn-quiet btn-small" type="submit" disabled={pending}>
        Revoke
      </button>
      {state.error && <span className="form-error">{state.error}</span>}
    </form>
  );
}

export function ApiKeyForms({ keys, canCreate }: { keys: Key[]; canCreate: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createApiKeyAction, {});
  return (
    <div className="form-stack">
      <form action={action} className="form-stack">
        <label className="field">
          <span>Key name</span>
          <input type="text" name="name" placeholder="For example: Actimize export job" disabled={!canCreate} maxLength={60} />
        </label>
        <div>
          <button className="btn btn-small" type="submit" disabled={!canCreate || pending}>
            Create key
          </button>
        </div>
        {state.error && <p className="form-error">{state.error}</p>}
        {state.secret && (
          <div className="key-reveal" role="status">
            <b>Copy this key now. It will not be shown again.</b>
            <br />
            <code>{state.secret}</code>
          </div>
        )}
      </form>
      {keys.length > 0 && (
        <ul className="cases">
          {keys.map((k) => (
            <li key={k.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                {k.name} <span className="num">{k.prefix}...</span>
                <span>
                  Created {k.createdAt}
                  {k.lastUsedAt ? `, last used ${k.lastUsedAt}` : ", never used"}
                </span>
              </div>
              {canCreate && <Revoke id={k.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
