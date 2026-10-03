import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, type DB } from "./db/client";
import { apiKeys, workspaces } from "./db/schema";
import { PLANS } from "./plans";

export type ApiAuth = { ok: true; db: DB; ws: typeof workspaces.$inferSelect; keyId: string; keyName: string } | { ok: false; status: number; error: string };

export async function authenticateApiKey(req: Request): Promise<ApiAuth> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("ask_")) return { ok: false, status: 401, error: "Send an API key as: Authorization: Bearer ask_..." };
  const db = await getDb();
  const hash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select({ key: apiKeys, ws: workspaces })
    .from(apiKeys)
    .innerJoin(workspaces, eq(workspaces.id, apiKeys.workspaceId))
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)));
  if (!row) return { ok: false, status: 401, error: "API key not recognized or revoked." };
  if (!PLANS[row.ws.plan].apiAccess) return { ok: false, status: 403, error: "API access is part of the Team and Enterprise plans." };
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.key.id));
  return { ok: true, db, ws: row.ws, keyId: row.key.id, keyName: row.key.name };
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}
