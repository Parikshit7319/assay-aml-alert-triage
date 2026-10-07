import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuth } from "./auth";

/** Operator-only pages: a signed-in user whose email is listed in ADMIN_EMAILS. Everyone else gets a 404. */
export async function requireOperator(): Promise<{ email: string; name: string }> {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s || !admins.includes(s.user.email.toLowerCase())) notFound();
  return { email: s.user.email, name: s.user.name };
}
