"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createAutoSync } from "@/lib/auto-sync";

/** Keeps intervals.icu data fresh while the app is visible and online. */
export function AutoSync({
  connected,
  lastSyncedAt,
}: {
  connected: boolean;
  lastSyncedAt: string | null;
}) {
  const router = useRouter();
  const controller = useRef<ReturnType<typeof createAutoSync> | null>(null);
  const latestSyncedAt = useRef(lastSyncedAt);

  useEffect(() => {
    latestSyncedAt.current = lastSyncedAt;
    controller.current?.updateLastSyncedAt(lastSyncedAt);
  }, [lastSyncedAt]);

  useEffect(() => {
    if (!connected) return;
    const sync = createAutoSync({
      document,
      window,
      isOnline: () => navigator.onLine,
      lastSyncedAt: latestSyncedAt.current,
      onSuccess: (body) => {
        if (body.matched > 0)
          toast.success(
            `Synced from intervals.icu: ${body.matched} workout${body.matched === 1 ? "" : "s"} matched.`,
          );
        router.refresh();
      },
    });
    controller.current = sync;
    return () => {
      sync.stop();
      controller.current = null;
    };
  }, [connected, router]);

  return null;
}
