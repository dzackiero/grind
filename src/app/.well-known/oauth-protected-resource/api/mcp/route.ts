import { getAuth } from "@/server/auth";

export const runtime = "nodejs";

/**
 * Protected resource metadata (RFC 9728) for /api/mcp. The mcp() plugin answers this path itself, matching the
 * request path as received, so the request goes to the auth handler unchanged.
 */
export async function GET(request: Request) {
  return (await getAuth()).handler(request);
}
