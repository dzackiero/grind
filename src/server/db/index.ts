import "server-only";
import { createDb, type DB } from "./client";

// One connection per server process; reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { kiloDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.kiloDb ??= createDb(process.env.DATABASE_URL);
  return globalForDb.kiloDb;
}

export type { DB };
