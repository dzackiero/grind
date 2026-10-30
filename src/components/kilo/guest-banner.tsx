"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "grind-guest-banner-until";
const HIDE_DAYS = 3;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/** Reminds guests that their account only lives in this browser. Dismissing hides it for a few days. */
export function GuestBanner() {
  const hiddenUntil = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY),
    () => "pending",
  );
  if (hiddenUntil === "pending" || Number(hiddenUntil) > Date.now()) return null;
  return (
    <div className="bg-card flex items-start gap-3 rounded-xl border p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold">Save your progress</p>
        <p className="text-muted-foreground text-sm">
          You&apos;re on a guest account that only lives in this browser. Add an email and password
          to keep your plan and log on any device.
        </p>
        <Link href="/settings#save-account" className="text-accent-ink text-sm font-semibold">
          Save my account
        </Link>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remind me later"
        onClick={() => {
          localStorage.setItem(KEY, String(Date.now() + HIDE_DAYS * 86_400_000));
          window.dispatchEvent(new StorageEvent("storage"));
        }}
      >
        <X />
      </Button>
    </div>
  );
}
