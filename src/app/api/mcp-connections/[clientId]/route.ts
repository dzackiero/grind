import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { revokeApp } from "@/server/mcp/connections";

export const runtime = "nodejs";

/** Disconnect an app: it loses access straight away. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const user = await requireUser();
    const { clientId } = await params;
    await revokeApp(await getDb(), user.id, decodeURIComponent(clientId));
    return Response.json({ disconnected: true });
  } catch (error) {
    return errorResponse(error);
  }
}
