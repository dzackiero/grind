import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
export const LOCAL_PGLITE_DIR = path.join(process.cwd(), ".data", "pglite");

/**
 * Neon (or any Postgres) when a connection string is given: node-postgres pool on the pooled
 * DATABASE_URL, attached to Vercel Fluid compute so idle clients close before the function suspends.
 * Otherwise an embedded Postgres (PGlite) stored in .data/, or in memory with "memory://".
 */
export async function createDb(url: string | undefined): Promise<DB> {
  if (url && url.startsWith("postgres")) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { attachDatabasePool } = await import("@vercel/functions");
    const pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 5_000 });
    attachDatabasePool(pool);
    return drizzle(pool, { schema }) as unknown as DB;
  }
  // The embedded database is for local development and tests. On Vercel its disk is read-only, so a missing or
  // malformed DATABASE_URL (for example one wrapped in quotes) must be an error that says so.
  if (process.env.VERCEL)
    throw new Error(
      "DATABASE_URL is missing or isn't a postgres:// address. Check it in the Vercel project's environment variables.",
    );
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(url === "memory://" ? undefined : LOCAL_PGLITE_DIR);
  const db = drizzle(client, { schema });
  // Embedded databases migrate themselves so local dev and tests need no setup
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as DB;
}
