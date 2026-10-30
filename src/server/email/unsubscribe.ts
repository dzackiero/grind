import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export type WeeklyKind = "weekly-recap" | "weekly-preview";

function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required for email preferences.");
  return createHmac("sha256", secret).update(`email-unsubscribe:${payload}`).digest("base64url");
}
export function unsubscribeToken(userId: string, kind: WeeklyKind) {
  const payload = Buffer.from(JSON.stringify({ userId, kind })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readUnsubscribeToken(token: string): { userId: string; kind: WeeklyKind } | null {
  try {
    if (token.length > 2048) return null;
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra) return null;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.userId !== "string" || !["weekly-recap", "weekly-preview"].includes(data.kind))
      return null;
    return data;
  } catch {
    return null;
  }
}
