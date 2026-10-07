"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { insertLead, parseLead } from "@/lib/leads";
import { DEMO_COOKIE } from "@/lib/tenant";

export interface FormState {
  error?: string;
  ok?: string;
}

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");
const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") ? n : "/app");

function message(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (/already exists|already registered/i.test(m)) return "An account with that email already exists. Sign in instead.";
  if (/invalid (email or )?password|invalid credentials/i.test(m)) return "Email or password is incorrect.";
  if (/password.*(short|least)/i.test(m)) return "Use a password of at least 10 characters.";
  return m || "Something went wrong. Try again.";
}

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const company = str(fd, "company");
  if (!name || !email || !password) return { error: "Name, email and password are required." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  try {
    const auth = await getAuth();
    const res = await auth.api.signUpEmail({ body: { name, email, password }, headers: await headers() });
    if (company) {
      const db = await getDb();
      const [m] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, res.user.id)).limit(1);
      if (m) await db.update(workspaces).set({ name: company.slice(0, 80) }).where(eq(workspaces.id, m.workspaceId));
    }
  } catch (err) {
    return { error: message(err) };
  }
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/app/import");
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  try {
    const auth = await getAuth();
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (err) {
    return { error: message(err) };
  }
  (await cookies()).delete(DEMO_COOKIE);
  redirect(safeNext(str(fd, "next")));
}

export async function socialSignInAction(fd: FormData) {
  const provider = str(fd, "provider") as "microsoft" | "github";
  const auth = await getAuth();
  const res = await auth.api.signInSocial({ body: { provider, callbackURL: "/app" }, headers: await headers() });
  (await cookies()).delete(DEMO_COOKIE);
  if (res && "url" in res && res.url) redirect(res.url);
  redirect("/sign-in");
}

export async function pilotAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseLead({
    name: str(fd, "name"),
    email: str(fd, "email"),
    company: str(fd, "company"),
    role: str(fd, "role"),
    segment: str(fd, "segment"),
    alerts_per_month: str(fd, "monthlyAlerts"),
    monitoring_system: str(fd, "monitoringSystem"),
    message: str(fd, "message"),
    website: str(fd, "website"),
  });
  if (!parsed.ok) return { error: parsed.error };
  const r = await insertLead(await getDb(), parsed.data);
  return r.ok ? { ok: r.message } : { error: r.error };
}
