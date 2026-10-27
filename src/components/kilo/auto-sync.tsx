"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const STALE_MS = 30 * 60_000;

/** Syncs intervals.icu in the background when the app opens and the last sync is over 30 minutes old. */
export function AutoSync({ connected, lastSyncedAt }: { connected: boolean; lastSyncedAt: string | null }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!connected || started.current) return;
    if (lastSyncedAt && Date.now() - Date.parse(lastSyncedAt) < STALE_MS) return;
    started.current = true;
    fetch("/api/intervals/sync", { method: "POST" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) return toast.error(body?.error ?? "Couldn't sync intervals.icu.");
        if (body.matched > 0) toast.success(`Synced from intervals.icu: ${body.matched} workout${body.matched === 1 ? "" : "s"} matched.`);
        router.refresh();
      })
      .catch(() => {});
  }, [connected, lastSyncedAt, router]);

  return null;
}
