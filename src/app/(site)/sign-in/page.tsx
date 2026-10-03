import type { Metadata } from "next";
import { SignInForm } from "@/components/AuthForms";
import { enabledSocialProviders } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/app";
  return (
    <section className="auth">
      <div className="auth__card">
        <h1>Sign in</h1>
        <p>Open your workspace.</p>
        <SignInForm next={next} providers={enabledSocialProviders()} />
      </div>
    </section>
  );
}
