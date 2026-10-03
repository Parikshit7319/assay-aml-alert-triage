import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDb, type DB } from "./db/client";
import { workspaceMembers, workspaces } from "./db/schema";
import { DEMO_ACTOR } from "./demo/seed";

export const DEMO_COOKIE = "assay_demo";

export type Workspace = typeof workspaces.$inferSelect;

export interface Tenant {
  db: DB;
  ws: Workspace;
  actor: string;
  mode: "demo" | "user";
  user: { id: string; name: string; email: string } | null;
  role: "owner" | "admin" | "analyst" | "reviewer";
}

async function sessionUser() {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user ?? null;
}

/**
 * Resolves the caller's workspace. An open demo wins (so signed-in users can
 * try it too, and leave with "Exit demo"); otherwise the signed-in user's workspace.
 */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const db = await getDb();
  const demoId = (await cookies()).get(DEMO_COOKIE)?.value;
  if (demoId) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, demoId), eq(workspaces.kind, "demo"), gt(workspaces.expiresAt, new Date())));
    if (ws) return { db, ws, actor: DEMO_ACTOR, mode: "demo", user: null, role: "owner" };
  }
  const user = await sessionUser();
  if (user) {
    const [m] = await db
      .select({ ws: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.id))
      .limit(1);
    if (m) return { db, ws: m.ws, actor: user.name, mode: "user", user: { id: user.id, name: user.name, email: user.email }, role: m.role };
  }
  return null;
});

export async function requireTenant(): Promise<Tenant> {
  const t = await getTenant();
  if (!t) redirect("/sign-in?next=/app");
  return t;
}

export function canAdminister(t: Tenant) {
  return t.role === "owner" || t.role === "admin";
}
