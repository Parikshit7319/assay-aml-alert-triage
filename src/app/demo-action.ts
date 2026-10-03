"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { createDemoWorkspace, DEMO_TTL_HOURS } from "@/lib/demo/seed";
import { DEMO_COOKIE, getTenant } from "@/lib/tenant";

/** POST-only on purpose: crawlers following links never create workspaces. */
export async function startDemo() {
  const existing = await getTenant();
  if (existing?.mode === "demo") redirect("/app");
  const db = await getDb();
  const id = await createDemoWorkspace(db);
  (await cookies()).set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEMO_TTL_HOURS * 3600,
    path: "/",
  });
  redirect("/app");
}

export async function endDemo() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/");
}

export async function restartDemo() {
  (await cookies()).delete(DEMO_COOKIE);
  const db = await getDb();
  const id = await createDemoWorkspace(db);
  (await cookies()).set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEMO_TTL_HOURS * 3600,
    path: "/",
  });
  redirect("/app");
}
