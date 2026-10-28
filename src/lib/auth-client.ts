import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// oauthProviderClient() attaches the signed OAuth query of the current page (when Claude sent the user
// here) to auth requests, so signing in or approving access continues the authorization automatically.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export const { signIn, signUp, signOut, useSession } = authClient;

/** True when this page was opened as part of an OAuth flow (it carries a signed query). */
export function inOAuthFlow() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sig");
}
