"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Asks intervals.icu for another batch of older runs so their records can be worked out. */
export function CheckRunsButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const res = await fetch("/api/intervals/sync", { method: "POST" });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            toast.error(body?.error ?? "Couldn't check your runs. Try again.");
            return;
          }
          toast.success(body.recordsPending ? `Checked ${body.recordsChecked} runs. ${body.recordsPending} to go.` : "All your runs are checked.");
          router.refresh();
        })
      }
    >
      <RefreshCw className={busy ? "animate-spin" : undefined} /> {busy ? "Checking…" : `Check ${pending} older ${pending === 1 ? "run" : "runs"}`}
    </Button>
  );
}
