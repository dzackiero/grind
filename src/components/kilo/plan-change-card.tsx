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
  details?: { workoutKey: string; before: string[]; after: string[] }[];
}

/** A suggestion from the coach (Claude): why, what changes, and Accept or Keep my plan. */
export function PlanChangeCard({ change }: { change: PendingChangeView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const answer = (action: "accept" | "reject") =>
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/plan-changes/${change.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body?.errors?.[0]?.message ?? body?.error ?? "Couldn't save your answer. Try again.",
        );
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
          Coach suggested{" "}
          {change.lines.length === 1 ? "a change" : `${change.lines.length} changes`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-5">{change.summary}</p>
        <ul className="flex flex-col gap-1.5">
          {change.lines.map((l) => (
            <li
              key={l.workoutKey}
              className="bg-card grid grid-cols-[88px_1fr] items-center gap-2 rounded-md px-3 py-2 text-[13px]"
            >
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
                <span
                  className={cn(
                    "text-muted-foreground ml-1.5 text-xs",
                    l.kind === "moved" && "hidden",
                  )}
                >
                  {l.kind === "added" ? "added" : l.kind === "removed" ? "removed" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {change.details && change.details.length > 0 && (
          <div className="flex flex-col gap-2">
            {change.details.map((detail) => {
              const line = change.lines.find((item) => item.workoutKey === detail.workoutKey);
              return (
                <details
                  key={detail.workoutKey}
                  className="bg-card rounded-md px-3 py-2 text-[13px]"
                >
                  <summary className="cursor-pointer leading-5 font-semibold">
                    Review{" "}
                    {detail.after[0]?.split(" · ")[0] ??
                      detail.before[0]?.split(" · ")[0] ??
                      "workout"}
                    {line && (
                      <span className="text-muted-foreground ml-2 font-normal">{line.when}</span>
                    )}
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {(["before", "after"] as const).map((side) => (
                      <div key={side} className="min-w-0">
                        <p className="text-muted-foreground mb-2 text-xs font-bold">
                          {side === "before" ? "Current plan" : "Proposed plan"}
                        </p>
                        {detail[side].length > 0 ? (
                          <ul className="flex flex-col gap-2 leading-5 break-words">
                            {detail[side].map((text, index) => (
                              <li key={index}>{text}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground leading-5">
                            {side === "before" ? "No workout scheduled." : "Workout removed."}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
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
