import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { runMigrations } from "./migrate";
import { schema } from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

type GlobalDb = { __assayDb?: Promise<DB> };
const g = globalThis as unknown as GlobalDb;

// Next traces this folder into the server bundle through outputFileTracingIncludes (next.config.ts).
const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** postgres:// and postgresql:// URLs go to a real Postgres server through postgres-js. */
export function isPostgresUrl(url: string | undefined): boolean {
  return !!url && /^postgres(ql)?:\/\//i.test(url);
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  const autoMigrate = process.env.AUTO_MIGRATE !== "false";

  if (url && isPostgresUrl(url)) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // prepare: false keeps it compatible with transaction-mode poolers (Neon, PgBouncer, Supabase).
    const sql = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
    const db = drizzle(sql, { schema });
    // Idempotent and serialized by an advisory lock, so concurrent cold starts are safe.
    if (autoMigrate) await runMigrations(db, MIGRATIONS);
    return db;
  }

  // Zero-setup local mode: embedded Postgres (PGlite) on disk, or in memory.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  let dataDir: string | undefined = url?.startsWith("memory") ? undefined : (url ?? path.join(process.cwd(), ".data", "pglite"));
  if (dataDir && !url && process.env.VERCEL) {
    // Serverless file systems are read-only except /tmp, and /tmp does not outlive the instance.
    dataDir = "/tmp/assay-pglite";
    console.warn("DATABASE_URL is not set on Vercel: using a throwaway embedded database in /tmp. Set DATABASE_URL to a Postgres URL (for example Neon) to keep data.");
  }
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  await runMigrations(db, MIGRATIONS);
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__assayDb) {
    g.__assayDb = connect().catch((err) => {
      g.__assayDb = undefined;
      throw err;
    });
  }
  return g.__assayDb;
}
