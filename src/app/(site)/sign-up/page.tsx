import type { Metadata } from "next";
import { SignUpForm } from "@/components/AuthForms";
import { enabledSocialProviders } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <section className="auth">
      <div className="auth__card">
        <h1>Create your workspace</h1>
        <p>Free on the Sandbox plan: 100 triage runs a month with the rules model, CSV import, QA and the audit log.</p>
        <SignUpForm providers={enabledSocialProviders()} />
      </div>
    </section>
  );
}
