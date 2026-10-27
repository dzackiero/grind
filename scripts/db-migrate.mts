// Applies migrations in ./drizzle. On Neon it uses the direct (unpooled) connection, as migrations need
// session state that the pooler doesn't keep. Without DATABASE_URL it migrates the local embedded database.
// Run: pnpm db:migrate
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const { createDb, MIGRATIONS_DIR } = await import("../src/server/db/client.ts");

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (url?.startsWith("postgres")) {
  const { Client } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const client = new Client({ connectionString: url });
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
  await client.end();
  console.log(`Migrations applied to Neon branch "${process.env.NEON_BRANCH ?? "unknown"}" (direct connection).`);
} else {
  await createDb(undefined);
  console.log("Migrations applied to the local embedded database (.data/pglite).");
}
process.exit(0);
