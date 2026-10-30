"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

/** Approve or deny an app's access. The signed OAuth query in the page URL is attached to the request for us. */
export function ConsentForm({
  clientName,
  redirectHost,
  userName,
  items,
}: {
  clientName: string;
  redirectHost: string | null;
  userName: string;
  items: { title: string; detail: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (accept: boolean) =>
    startTransition(async () => {
      setError(null);
      const { data, error } = await authClient.$fetch<{ redirect?: boolean; url?: string }>(
        "/oauth2/consent",
        { method: "POST", body: { accept } },
      );
      if (error || !data?.url) {
        setError(
          error?.message ??
            "Couldn't save your choice. Go back to Claude and try connecting again.",
        );
        return;
      }
      window.location.href = data.url;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle variant="display">Connect {clientName} to Grind?</CardTitle>
        <CardDescription>
          Signed in as {userName}.
          {redirectHost ? (
            <>
              {" "}
              After you choose, you&apos;ll return to{" "}
              <b className="text-foreground">{redirectHost}</b>.
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent layout="stack" gap="5">
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="bg-accent-soft text-accent-ink mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                <Check className="size-4" />
              </span>
              <span className="flex flex-col">
                <span className="font-semibold">{item.title}</span>
                <span className="text-muted-foreground text-sm">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <Button size="lg" disabled={pending} onClick={() => decide(true)}>
            {pending ? "One moment…" : "Allow"}
          </Button>
          <Button size="lg" variant="outline" disabled={pending} onClick={() => decide(false)}>
            Don&apos;t allow
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          You can disconnect {clientName} any time in Grind → Settings.
        </p>
      </CardContent>
    </Card>
  );
}
