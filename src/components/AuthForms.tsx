"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction, socialSignInAction, type FormState } from "@/app/(site)/auth-actions";

function Social({ providers }: { providers: { microsoft: boolean; github: boolean } }) {
  if (!providers.microsoft && !providers.github) return null;
  return (
    <>
      <div style={{ display: "grid", gap: 8 }}>
        {providers.microsoft && (
          <form action={socialSignInAction}>
            <input type="hidden" name="provider" value="microsoft" />
            <button className="btn btn-outline" style={{ width: "100%" }} type="submit">
              Continue with Microsoft Entra ID
            </button>
          </form>
        )}
        {providers.github && (
          <form action={socialSignInAction}>
            <input type="hidden" name="provider" value="github" />
            <button className="btn btn-outline" style={{ width: "100%" }} type="submit">
              Continue with GitHub
            </button>
          </form>
        )}
      </div>
      <div className="auth__divider">or with email</div>
    </>
  );
}

export function SignInForm({ next, providers }: { next: string; providers: { microsoft: boolean; github: boolean } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <>
      <Social providers={providers} />
      <form action={action} className="form-stack" style={{ display: "grid", gap: 14 }}>
        <input type="hidden" name="next" value={next} />
        <label className="field">
          <span>Work email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </button>
      </form>
      <p className="auth__alt">
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </>
  );
}

export function SignUpForm({ providers }: { providers: { microsoft: boolean; github: boolean } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  return (
    <>
      <Social providers={providers} />
      <form action={action} style={{ display: "grid", gap: 14 }}>
        <label className="field">
          <span>Your name</span>
          <input type="text" name="name" autoComplete="name" required />
        </label>
        <label className="field">
          <span>Company</span>
          <input type="text" name="company" autoComplete="organization" />
        </label>
        <label className="field">
          <span>Work email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="new-password" minLength={10} required />
          <small>At least 10 characters.</small>
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Creating your workspace" : "Create account"}
        </button>
        <p className="auth__alt" style={{ fontSize: 13 }}>
          You start on the free Sandbox plan. Use test or synthetic data until a data agreement is signed.
        </p>
      </form>
      <p className="auth__alt">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </>
  );
}
