import { and, eq, max } from "drizzle-orm";
import type { DB } from "../db/client";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "../db/schema";

/** Apps (like Claude) the athlete has approved, with when they last connected. */
export async function listConnectedApps(db: DB, userId: string) {
  const rows = await db
    .select({
      clientId: oauthConsent.clientId,
      name: oauthClient.name,
      scopes: oauthConsent.scopes,
      since: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId));
  const lastUse = await db
    .select({ clientId: oauthAccessToken.clientId, last: max(oauthAccessToken.createdAt) })
    .from(oauthAccessToken)
    .where(eq(oauthAccessToken.userId, userId))
    .groupBy(oauthAccessToken.clientId);
  const last = new Map(lastUse.map((r) => [r.clientId, r.last]));
  return rows.map((r) => ({
    clientId: r.clientId,
    name: r.name ?? "Unnamed app",
    canEdit: r.scopes.includes("plan:write"),
    since: r.since.toISOString(),
    lastConnected: (last.get(r.clientId) ?? r.since).toISOString(),
  }));
}

/**
 * Is this token still backed by an approval from the athlete? Access tokens are signed and checked offline,
 * so deleting them from the database wouldn't stop them working. Instead every request checks that the
 * athlete's approval for the app still exists and is not newer than the token (approving again after a
 * disconnect doesn't bring old tokens back). `issuedAt` is the token's iat, in seconds.
 */
export async function isGrantActive(db: DB, userId: string, clientId: string, issuedAt: number) {
  const [consent] = await db
    .select({ createdAt: oauthConsent.createdAt })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  // iat has second precision, consent has milliseconds: allow a couple of seconds of slack
  return !!consent && issuedAt * 1000 + 2000 >= consent.createdAt.getTime();
}

/** Cut an app off: delete what the athlete approved and every token it holds. */
export async function revokeApp(db: DB, userId: string, clientId: string) {
  await db.transaction(async (tx) => {
    // Access tokens point at refresh tokens, so they go first
    await tx
      .delete(oauthAccessToken)
      .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)));
    await tx
      .delete(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
    await tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
  });
}
