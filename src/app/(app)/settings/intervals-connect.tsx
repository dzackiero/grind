"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Stat } from "@/components/kilo/stat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntervalsStatus } from "@/server/intervals/sync";
import { timeAgo } from "@/components/kilo/format";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.issues?.[0]?.message ?? json?.error ?? "Something went wrong. Try again.");
  return json;
}

export function IntervalsConnect({ status, counts }: { status: IntervalsStatus; counts: { activities: number; wellnessDays: number; matched: number } }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  if (!status.connected) {
    return (
      <form
        className="flex flex-col gap-4"
        action={(form) =>
          run(async () => {
            const result = await call("PUT", "/api/intervals", { apiKey: form.get("apiKey"), athleteId: form.get("athleteId") });
            toast.success(`Connected${result.athlete.name ? ` as ${result.athlete.name}` : ""}. Synced ${result.sync.activities} activities, matched ${result.sync.matched} workouts.`);
          })
        }
      >
        <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
          <li>
            Open{" "}
            <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer" className="text-accent-ink inline-flex items-center gap-1 font-semibold">
              intervals.icu settings <ExternalLink className="size-3" />
            </a>
          </li>
          <li>Scroll to Developer Settings and copy your API key</li>
          <li>Paste it here</li>
        </ol>
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiKey">API key</Label>
          <Input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="Paste your API key" />
        </div>
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Athlete ID (optional)</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Input id="athleteId" name="athleteId" aria-label="Athlete ID" placeholder="e.g. i123456" />
            <p className="text-muted-foreground text-xs">Leave empty to use the account the key belongs to.</p>
          </div>
        </details>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Connecting and syncing…" : "Connect intervals.icu"}
        </Button>
        <p className="text-muted-foreground text-xs">Your key is encrypted before it&apos;s stored. Activities imported into intervals.icu from Strava can&apos;t be read through its API.</p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="text-success size-5" />
        <span>
          Connected{status.athleteName ? <> as <b>{status.athleteName}</b></> : null}
          {status.athleteId ? <span className="text-muted-foreground"> · {status.athleteId}</span> : null}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Activities" value={counts.activities} />
        <Stat label="Matched" value={counts.matched} />
        <Stat label="Wellness" value={counts.wellnessDays} unit="days" />
      </div>
      <p className="text-muted-foreground text-sm">{status.lastSyncedAt ? `Last synced ${timeAgo(status.lastSyncedAt)}.` : "Not synced yet."} Kilo imports one year of activities and 60 days of wellness. It checks for updates when you open or return to the app, reconnect, and every five minutes while the app is visible and online.</p>
      {(error ?? status.lastSyncError) && (
        <Alert variant="destructive">
          <AlertDescription>{error ?? status.lastSyncError}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await call("POST", "/api/intervals/sync");
              toast.success(`Synced ${r.activities} activities and ${r.wellnessDays} days of wellness. ${r.matched} new matches.`);
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} /> {pending ? "Syncing…" : "Sync now"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={pending}>
              <Unplug /> Disconnect
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect intervals.icu?</AlertDialogTitle>
              <AlertDialogDescription>Kilo forgets your API key and deletes the synced activities and wellness. Workouts you completed stay completed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep connected</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  run(async () => {
                    await call("DELETE", "/api/intervals");
                    toast.success("Disconnected from intervals.icu.");
                  })
                }
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
