import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { DB } from "../db/client";
import { account, session, user, verification } from "../db/schema";

/**
 * Better Auth instance for a database. Email + password always; Google when its keys are set.
 * The MCP OAuth plugin gets added here later.
 */
export function createAuth(db: DB, plugins: BetterAuthPlugin[] = []) {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: google,
    session: { expiresIn: 60 * 60 * 24 * 30 },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
