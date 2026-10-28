import { getAuth } from "@/server/auth";

export const runtime = "nodejs";

/** Root-level protected resource metadata: the fallback location clients try after the path-inserted one. */
export async function GET(request: Request) {
  return (await getAuth()).handler(request);
}
