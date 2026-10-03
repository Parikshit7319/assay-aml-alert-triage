import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { schema } from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

type GlobalDb = { __assayDb?: Promise<DB> };
const g = globalThis as unknown as GlobalDb;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  const autoMigrate = process.env.AUTO_MIGRATE !== "false";

  if (url && url.startsWith("postgres")) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
    const db = drizzle(sql, { schema });
    if (autoMigrate) {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      await migrate(db, { migrationsFolder: MIGRATIONS });
    }
    return db;
  }

  // Zero-setup local mode: embedded Postgres (PGlite) on disk, or in memory.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = url?.startsWith("memory") ? undefined : (url ?? path.join(process.cwd(), ".data", "pglite"));
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as DB;
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
