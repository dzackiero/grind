"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Turns the guest into a full account in place, so everything logged so far stays. */
export function SaveAccountForm({ name }: { name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/account/upgrade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setError(body?.issues?.[0]?.message ?? body?.error ?? "Couldn't save your account. Try again.");
          return;
        }
        router.refresh();
      } catch {
        setError("Couldn't reach Grind. Please try again.");
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="save-name">Name</Label>
        <Input id="save-name" name="name" autoComplete="name" required defaultValue={name === "Guest" ? "" : name} placeholder="Dzaky" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="save-email">Email</Label>
        <Input id="save-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="save-password">Password</Label>
        <Input id="save-password" name="password" type="password" minLength={8} autoComplete="new-password" required placeholder="At least 8 characters" />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save my account"}
      </Button>
    </form>
  );
}
