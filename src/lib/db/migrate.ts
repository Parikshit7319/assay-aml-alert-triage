import "server-only";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { DB } from "./client";

/**
 * Arbitrary constant key for the migration lock. Every instance that starts at
 * the same time queues on it, so only one applies a given migration.
 */
const LOCK_KEY = "7316002841";

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * Applies pending migrations from the drizzle-kit output folder.
 *
 * Same bookkeeping as drizzle's own migrator (the "drizzle"."__drizzle_migrations"
 * table, compared on the journal timestamp), so databases migrated before this
 * runner existed carry on unchanged. The difference: everything, including the
 * check for what is already applied, happens in one transaction that first takes
 * a transaction-scoped advisory lock. Two cold starts racing each other queue on
 * the lock instead of both trying to create the same table, and the lock is
 * released at commit, which also works behind a transaction-mode pooler such as
 * Neon's or PgBouncer.
 */
export async function runMigrations(db: DB, migrationsFolder: string): Promise<{ applied: number }> {
  const migrations = readMigrationFiles({ migrationsFolder });
  let applied = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`select pg_advisory_xact_lock(${LOCK_KEY})`));
    await tx.execute(sql`create schema if not exists "drizzle"`);
    await tx.execute(sql`create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)`);
    const [last] = rowsOf(await tx.execute(sql`select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1`));
    const lastMillis = last ? Number(last.created_at) : null;
    for (const m of migrations) {
      if (lastMillis !== null && lastMillis >= m.folderMillis) continue;
      for (const stmt of m.sql) {
        if (stmt.trim()) await tx.execute(sql.raw(stmt));
      }
      await tx.execute(sql`insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values (${m.hash}, ${m.folderMillis})`);
      applied++;
    }
  });
  return { applied };
}
