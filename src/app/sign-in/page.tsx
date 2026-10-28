import { redirect } from "next/navigation";
import { Logo } from "@/components/kilo/logo";
import { getCurrentUser } from "@/server/auth";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · Grind" };

// These pages read the signed-in athlete, so they are rendered per request and never during the build.
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string; sig?: string }> }) {
  const { mode, sig } = await searchParams;
  // Someone arriving from Claude has a signed query; keep them here so the flow can continue after sign-in
  const fromClaude = !!sig;
  if (!fromClaude && (await getCurrentUser())) redirect("/today");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="font-display text-3xl font-extrabold">{fromClaude ? "Sign in to connect Claude" : "Run the kilometers. Lift the kilos."}</h1>
        <p className="text-muted-foreground">
          {fromClaude ? "Sign in to your Grind account. Next you'll choose what Claude can see and change." : "One plan for running and strength, built from your intervals.icu data."}
        </p>
      </div>
      <AuthForm initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
    </main>
  );
}
