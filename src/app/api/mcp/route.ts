import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { appUrl, mcpResource } from "@/server/auth/create-auth";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { isGrantActive } from "@/server/mcp/connections";
import { buildMcpServer } from "@/server/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 401 that tells the client to start the sign-in flow again. */
function reauthorize(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer error="invalid_token", error_description="${message}", resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp"`,
    },
  });
}

/**
 * Grind's MCP endpoint. requireMcpAuth checks the OAuth access token (signature, issuer, audience, expiry)
 * and answers unauthenticated requests with the 401 challenge that starts the sign-in flow. We also check the
 * athlete hasn't disconnected the app, then build a server for them with only the tools their scopes allow.
 *
 * Only POST is exported, so GET and DELETE get a 405. legacy defaults to "stateless": older MCP clients work too.
 */
async function handler(request: Request) {
  const auth = await getAuth();
  return requireMcpAuth(
    auth,
    async (req, claims) => {
      const userId = claims.sub;
      const clientId = String(claims.client_id ?? claims.azp ?? "");
      if (typeof userId !== "string" || !clientId) return reauthorize("The token is missing its user or app.");

      const db = await getDb();
      if (!(await isGrantActive(db, userId, clientId, Number(claims.iat ?? 0)))) return reauthorize("Access was disconnected. Connect Grind again.");

      const scopes = new Set(String(claims.scope ?? "").split(" ").filter(Boolean));
      const mcp = createMcpHandler(() => buildMcpServer({ db, userId, scopes }), { onerror: (e) => console.error("[mcp]", e.message) });
      return mcp.fetch(req);
    },
    // A token must at least allow reading; the challenge asks clients for write access as well
    { resource: mcpResource(), requiredScopes: ["plan:read"], challengeScopes: ["plan:read", "plan:write"] },
  )(request);
}

export { handler as POST };
