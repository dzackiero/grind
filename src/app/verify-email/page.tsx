import { AuthShell } from "@/components/kilo/auth-shell";
import { VerificationForm } from "./verification-form";

export const metadata = { title: "Verify email · Grind" };
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; returnTo?: string }>;
}) {
  const { email, returnTo } = await searchParams;
  // Only a sign-in URL on this origin may continue an interrupted OAuth flow.
  const target =
    returnTo === "/sign-in" || returnTo?.startsWith("/sign-in?") ? returnTo : "/sign-in";
  return (
    <AuthShell
      title="Check your inbox"
      description="Open your verification link, then sign in to Grind. You can request a new link below."
    >
      <VerificationForm email={email ?? ""} returnTo={target} />
    </AuthShell>
  );
}
