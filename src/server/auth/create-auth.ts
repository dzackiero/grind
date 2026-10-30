import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, jwt } from "better-auth/plugins";
import type { DB } from "../db/client";
import * as schema from "../db/schema";
import { authEmailOptions, type BackgroundTask } from "../email/auth";

/** Where this app is served. Used as the OAuth issuer and to build the MCP resource URL. */
export function appUrl() {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** The protected resource identifier Claude's tokens are bound to. */
export function mcpResource() {
  return `${appUrl()}/api/mcp`;
}

/**
 * Better Auth for a database: email + password, guest accounts, optional Google, and Grind as an OAuth server for MCP.
 *
 * Following Better Auth's MCP docs:
 *  - jwt()  signs access tokens and serves /jwks
 *  - mcp()  is the OAuth 2.1 provider (sign-in page, consent page, tokens, discovery)
 *  - cimd() lets clients like Claude identify themselves with a metadata URL instead of pre-registering
 */
export function createAuth(db: DB, plugins: BetterAuthPlugin[] = [], background?: BackgroundTask) {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    ...authEmailOptions(db, appUrl(), background),
    rateLimit: {
      enabled: true,
      customRules: {
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/sign-in/anonymous": { window: 60, max: 10 },
      },
    },
    socialProviders: google,
    session: { expiresIn: 60 * 60 * 24 * 30 },
    plugins: [
      // Guests skip the sign-up form. Their placeholder email is never verified, so no email is ever sent to it.
      anonymous({ emailDomainName: "guest.invalid", generateName: () => "Guest" }),
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: mcpResource(),
        scopes: ["openid", "profile", "email", "offline_access", "plan:read", "plan:write"],
        // Claude can identify itself by metadata URL (cimd below) or register itself the older way.
        // Registration only creates a client record: nothing is shared until the user approves it on /consent.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      ...plugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
