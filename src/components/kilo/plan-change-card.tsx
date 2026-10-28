"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChangeLine } from "@/lib/plan";
import { cn } from "cn";

export interface PendingChangeView {
  id: string;
  summary: string;
  lines: ChangeLine[];
}

/** A suggestion from the coach (Claude): why, what changes, and Accept or Keep my plan. */
export function PlanChangeCard({ change }: { change: PendingChangeView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const answer = (action: "accept" | "reject") =>
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/plan-changes/${change.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.errors?.[0]?.message ?? body?.error ?? "Couldn't save your answer. Try again.");
        // A stale or already-answered suggestion won't come back: show the current state
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success(action === "accept" ? "Plan updated." : "Kept your plan as it was.");
      router.refresh();
    });

  return (
    <Card className="bg-accent-soft gap-4 border-transparent" aria-label="Coach suggestion">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[13px] font-bold">
          <Sparkles className="text-accent-ink size-4" />
          Coach suggested {change.lines.length === 1 ? "a change" : `${change.lines.length} changes`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-5">{change.summary}</p>
        <ul className="flex flex-col gap-1.5">
          {change.lines.map((l) => (
            <li key={l.workoutKey} className="bg-card grid grid-cols-[88px_1fr] items-center gap-2 rounded-md px-3 py-2 text-[13px]">
              <span className="text-muted-foreground font-bold">{l.when}</span>
              <span className="min-w-0">
                {l.kind === "moved" && <b>{l.to}</b>}
                {l.kind === "removed" && <s className="text-subtle">{l.from}</s>}
                {l.kind === "added" && <b>{l.to}</b>}
                {l.kind === "changed" && (
                  <>
                    <s className="text-subtle">{l.from}</s> → <b>{l.to}</b>
                  </>
                )}
                <span className={cn("text-muted-foreground ml-1.5 text-xs", l.kind === "moved" && "hidden")}>{l.kind === "added" ? "added" : l.kind === "removed" ? "removed" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => answer("accept")}>
            {pending ? "Saving…" : "Accept changes"}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => answer("reject")}>
            Keep my plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
