import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/server/auth";

export const runtime = "nodejs";

/**
 * OAuth authorization server metadata (RFC 8414). Our issuer has a path (/api/auth), so clients look
 * for it at /.well-known/oauth-authorization-server/api/auth.
 */
export async function GET(request: Request) {
  return oauthProviderAuthServerMetadata(await getAuth())(request);
}
