import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { mondayOf } from "@/lib/demo/rollups";
import { purgeExpiredDemos } from "@/lib/demo/seed";
import { rollupWeek } from "@/lib/metrics";
import { DAY } from "@/lib/util";

/** Nightly job: purge expired demos and refresh this week's and last week's rollups. Protect with CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  await purgeExpiredDemos(db);
  const customers = await db.select().from(workspaces).where(eq(workspaces.kind, "customer"));
  const thisWeek = mondayOf(new Date());
  let rows = 0;
  for (const ws of customers) {
    rows += await rollupWeek(db, ws, thisWeek);
    rows += await rollupWeek(db, ws, new Date(thisWeek.getTime() - 7 * DAY));
  }
  return Response.json({ workspaces: customers.length, rollupRows: rows });
}
