"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm({ mode, token }: { mode: "request" | "reset"; token?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (mode === "reset" && !token) return <p role="alert">This reset link is invalid or expired. <Link href="/forgot-password" className="underline">Request another link</Link>.</p>;
  if (done) return <div role="status" className="space-y-3"><p>{mode === "request" ? "If an account exists for that email, a reset link is on its way. Check your inbox and spam folder." : "Your password has been reset. Sign in with your new password."}</p>{mode === "reset" && <Link className="underline" href="/sign-in">Sign in</Link>}</div>;
  function submit(form: FormData) {
    setError("");
    const password = String(form.get("password") ?? "");
    if (mode === "reset" && password !== form.get("confirmPassword")) { setError("The passwords don't match."); return; }
    startTransition(async () => {
      try {
        const result = mode === "request"
          ? await authClient.requestPasswordReset({ email: String(form.get("email")).trim(), redirectTo: `${window.location.origin}/reset-password` })
          : await authClient.resetPassword({ token, newPassword: password });
        if (result.error) { setError(mode === "request" ? "Couldn't request a reset link. Wait a minute and try again." : "Couldn't reset your password. This link may have expired or already been used."); return; }
        setDone(true);
      } catch { setError("Couldn't reach Grind. Please try again."); }
    });
  }
  return <form action={submit} className="flex flex-col gap-4">
    {mode === "request" ? <div className="space-y-2"><Label htmlFor="email">Email</Label><Input name="email" id="email" type="email" autoComplete="email" required /></div> : <>
      <div className="space-y-2"><Label htmlFor="password">New password</Label><Input name="password" id="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div>
      <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm password</Label><Input name="confirmPassword" id="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div>
    </>}
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "One moment…" : mode === "request" ? "Send reset link" : "Reset password"}</Button>
  </form>;
}
