import { AuthShell } from "@/components/kilo/auth-shell";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Reset password · Grind" };
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password" description="Use at least 8 characters.">
      <PasswordForm mode="reset" token={error ? undefined : token} />
    </AuthShell>
  );
}
