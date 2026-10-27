import "server-only";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getDb } from "../db";
import { createAuth, type Auth } from "./create-auth";

const globalForAuth = globalThis as unknown as { kiloAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.kiloAuth ??= getDb().then((db) => createAuth(db, [nextCookies()]));
  return globalForAuth.kiloAuth;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue.");
  }
}

/** The signed-in user for the current request, or null. */
export async function getCurrentUser() {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: await headers() });
  return result?.user ?? null;
}

/** The signed-in user, or throws UnauthorizedError. */
export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  return u;
}
