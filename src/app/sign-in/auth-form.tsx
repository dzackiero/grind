"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient, inOAuthFlow } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function AuthForm({
  initialMode,
  googleEnabled,
  emailEnabled = false,
  guestEnabled = false,
}: {
  initialMode: Mode;
  googleEnabled: boolean;
  emailEnabled?: boolean;
  guestEnabled?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setError(null);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    startTransition(async () => {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              name,
              email,
              password,
              callbackURL: `/sign-in${window.location.search}`,
            })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 401
            ? "That email and password don't match. Check them and try again."
            : (result.error.message ?? "Couldn't sign you in. Try again."),
        );
        return;
      }
      // When Claude sent the user here, Better Auth continues the authorization (consent) by itself
      if (inOAuthFlow()) return;
      // New accounts go to onboarding; the app layout sends people without a plan there too
      router.push(mode === "sign-up" ? "/onboarding" : "/today");
      router.refresh();
    });
  }

  function continueAsGuest() {
    setError(null);
    startTransition(async () => {
      const result = await authClient.signIn.anonymous();
      if (result.error) {
        setError(result.error.message ?? "Couldn't start a guest session. Try again.");
        return;
      }
      router.push("/onboarding");
      router.refresh();
    });
  }

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} spacing="relaxed">
      <TabsList width="full">
        <TabsTrigger value="sign-in">Sign in</TabsTrigger>
        <TabsTrigger value="sign-up">Create account</TabsTrigger>
      </TabsList>

      <form action={submit} className="flex flex-col gap-4">
        <TabsContent value="sign-up">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required={mode === "sign-up"}
              placeholder="Dzaky"
            />
          </div>
        </TabsContent>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            placeholder={mode === "sign-up" ? "At least 8 characters" : undefined}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "One moment…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
        {mode === "sign-in" && emailEnabled && (
          <Link
            href="/forgot-password"
            className="text-muted-foreground text-center text-sm underline"
          >
            Forgot password?
          </Link>
        )}
      </form>

      {(googleEnabled || guestEnabled) && (
        <div className="flex flex-col gap-3">
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <div className="flex-1">
              <Separator />
            </div>{" "}
            or
            <div className="flex-1">
              <Separator />
            </div>
          </div>
          {googleEnabled && (
            <Button
              variant="outline"
              size="lg"
              onClick={() =>
                authClient.signIn.social({ provider: "google", callbackURL: "/today" })
              }
            >
              Continue with Google
            </Button>
          )}
          {guestEnabled && (
            <Button variant="outline" size="lg" disabled={pending} onClick={continueAsGuest}>
              Continue as guest
            </Button>
          )}
        </div>
      )}
    </Tabs>
  );
}
