"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VerificationForm({
  email,
  returnTo = "/sign-in",
}: {
  email: string;
  returnTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function resend(form: FormData) {
    startTransition(async () => {
      try {
        const result = await authClient.sendVerificationEmail({
          email: String(form.get("email")).trim(),
          callbackURL: returnTo,
        });
        setMessage(
          result.error
            ? "Couldn't send a verification link. Wait a minute and try again."
            : "If this address has an unverified account, a new link is on its way. Check spam too.",
        );
      } catch {
        setMessage("Couldn't reach Grind. Please try again.");
      }
    });
  }
  return (
    <form action={resend} className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="verify-email">Email</Label>
        <Input
          id="verify-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          required
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Links expire after 1 hour. You can request another one here.
      </p>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Link href={returnTo} className="text-sm underline">
        I&apos;ve verified my email — sign in
      </Link>
    </form>
  );
}
