import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/kilo/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/server/auth";
import { getViewer } from "@/server/queries";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Connect to Grind" };

type Params = Record<string, string | string[] | undefined>;

/** Plain-language meaning of each scope an app can ask for. */
const SCOPE_LABELS: Record<string, { title: string; detail: string }> = {
  "plan:read": {
    title: "See your training",
    detail:
      "Your plan, workouts, recorded activities, recovery, coaching preferences and any limitations you have shared.",
  },
  "plan:write": {
    title: "Suggest changes to your plan",
    detail:
      "It can propose workout edits for your approval in Grind or chat, and save coaching preferences and notes when you ask.",
  },
  offline_access: {
    title: "Stay connected",
    detail: "So you don't have to approve it again each time.",
  },
  openid: {
    title: "Know who you are",
    detail: "Your name and email, to link this to your account.",
  },
  profile: {
    title: "Know who you are",
    detail: "Your name and email, to link this to your account.",
  },
  email: {
    title: "Know who you are",
    detail: "Your name and email, to link this to your account.",
  },
};

// These pages read the signed-in athlete, so they are rendered per request and never during the build.
export const dynamic = "force-dynamic";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, v);

  const auth = await getAuth();
  const { secret } = await auth.$context;
  // The query is signed by our own server: reject anything that was edited or didn't come from the authorize step
  const valid = query.has("sig") && (await verifyOAuthQueryParams(query.toString(), secret));
  const user = await getViewer();
  if (valid && !user) redirect(`/sign-in?${query.toString()}`);

  if (valid && user?.isAnonymous) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
        <Logo />
        <Alert>
          <AlertTitle>Save your account first</AlertTitle>
          <AlertDescription>
            Claude can only connect to a saved account, not a guest one. Add an email and password
            in Settings, then connect again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <a href="/settings#save-account">Open Settings</a>
        </Button>
      </main>
    );
  }

  if (!valid || !user) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
        <Logo />
        <Alert variant="destructive">
          <AlertTitle>This link isn&apos;t valid</AlertTitle>
          <AlertDescription>Go back to Claude and start connecting Grind again.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <a href="/today">Open Grind</a>
        </Button>
      </main>
    );
  }

  const clientId = query.get("client_id") ?? "";
  const client = await auth.api
    .getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() })
    .catch(() => null);
  const clientName =
    (client as { client_name?: string; name?: string } | null)?.client_name ??
    (client as { name?: string } | null)?.name ??
    "An app";
  // Show where the approval will be sent, so a look-alike name can't hide who is asking
  const redirectHost = (() => {
    try {
      return new URL(query.get("redirect_uri") ?? "").host || null;
    } catch {
      return null;
    }
  })();

  const requested = (query.get("scope") ?? "").split(" ").filter(Boolean);
  const seen = new Set<string>();
  const items = requested.flatMap((s) => {
    const label = SCOPE_LABELS[s];
    if (!label || seen.has(label.title)) return [];
    seen.add(label.title);
    return [label];
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <ConsentForm
        clientName={clientName}
        redirectHost={redirectHost}
        userName={user.name}
        items={items}
      />
    </main>
  );
}
