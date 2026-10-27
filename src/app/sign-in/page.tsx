import { redirect } from "next/navigation";
import { Logo } from "@/components/kilo/logo";
import { getCurrentUser } from "@/server/auth";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in · Kilo" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await getCurrentUser()) redirect("/today");
  const { mode } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Logo />
        <h1 className="font-display text-3xl font-extrabold">Run the kilometers. Lift the kilos.</h1>
        <p className="text-muted-foreground">One plan for running and strength, built from your intervals.icu data.</p>
      </div>
      <AuthForm initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
    </main>
  );
}
