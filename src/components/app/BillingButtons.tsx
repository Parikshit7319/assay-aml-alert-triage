"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkoutAction, portalAction, type ActionState } from "@/app/app/actions";

export function BillingButtons({ demo, configured, canManage, plan, hasCustomer }: { demo: boolean; configured: boolean; canManage: boolean; plan: string; hasCustomer: boolean }) {
  const [cState, checkout, cPending] = useActionState<ActionState>(checkoutAction, {});
  const [pState, portal, pPending] = useActionState<ActionState>(portalAction, {});
  if (demo) {
    return (
      <p className="decide__hint">
        Billing is off in the demo. <Link href="/sign-up">Create an account</Link> to start on Sandbox and upgrade when you are ready.
      </p>
    );
  }
  return (
    <div className="form-stack">
      {!configured && <p className="note">Billing is not configured on this deployment yet. The operator sets the Stripe keys described in the README.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {plan !== "team" && (
          <form action={checkout}>
            <button className="btn" type="submit" disabled={!configured || !canManage || cPending}>
              Upgrade to Team
            </button>
          </form>
        )}
        {hasCustomer && (
          <form action={portal}>
            <button className="btn btn-outline" type="submit" disabled={!configured || pPending}>
              Manage billing
            </button>
          </form>
        )}
        <Link className="btn btn-quiet" href="/pilot">
          Talk to us about Enterprise
        </Link>
      </div>
      {cState.error && <p className="form-error">{cState.error}</p>}
      {pState.error && <p className="form-error">{pState.error}</p>}
    </div>
  );
}
