import { AuthShell } from "@/components/kilo/auth-shell";
import { PasswordForm } from "../reset-password/password-form";

export const metadata = { title: "Forgot password · Grind" };
export default function ForgotPasswordPage() {
  return <AuthShell title="Forgot your password?" description="We'll email you a link to choose a new one."><PasswordForm mode="request" /></AuthShell>;
}
