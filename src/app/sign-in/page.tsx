import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/kilo/logo";
import { getCurrentUser } from "@/server/auth";
import { AuthForm } from "./auth-form";
import { emailConfigured } from "@/server/email/transport";

export const metadata = { title: "Sign in · Grind" };

// These pages read the signed-in athlete, so they are rendered per request and never during the build.
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string; sig?: string; error?: string }> }) {
  const { mode, sig, error } = await searchParams;
  // Someone arriving from Claude has a signed query; keep them here so the flow can continue after sign-in
  const fromClaude = !!sig;
  if (!fromClaude && (await getCurrentUser())) redirect("/today");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="font-display text-3xl font-extrabold">{fromClaude ? "Sign in to connect Claude" : "Run it. Lift it. Grind it out."}</h1>
        <p className="text-muted-foreground">
          {fromClaude ? "Sign in to your Grind account. Next you'll choose what Claude can see and change." : "Your runs, lifts and habits in one plan. Ground fresh from your watch data."}
        </p>
      </div>
      {error && ["TOKEN_EXPIRED", "INVALID_TOKEN", "USER_NOT_FOUND"].includes(error.toUpperCase()) && (
        <p role="alert" className="text-destructive text-sm">This verification link is invalid or expired. <Link href="/verify-email" className="underline">Request another link</Link>.</p>
      )}
      <AuthForm initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} googleEnabled={!!process.env.GOOGLE_CLIENT_ID} emailEnabled={emailConfigured()} guestEnabled={!fromClaude} />
    </main>
  );
}
