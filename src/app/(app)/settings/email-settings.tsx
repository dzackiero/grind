"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailSettings({ preferences, timezone, verified, email, enabled }: {
  preferences: { weeklyRecap: boolean; weeklyPreview: boolean }; timezone: string; verified: boolean; email: string; enabled: boolean;
}) {
  const router = useRouter();
  const [zone, setZone] = useState(timezone);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  function save(form: FormData) {
    startTransition(async () => {
      setMessage("");
      try {
        const response = await fetch("/api/email-preferences", { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weeklyRecap: form.get("weeklyRecap") === "on", weeklyPreview: form.get("weeklyPreview") === "on", timezone: zone }) });
        if (!response.ok) {
          const result = await response.json();
          setMessage(result.issues?.[0]?.message ?? result.error ?? "Couldn't save your preferences.");
          return;
        }
        setMessage("Email preferences saved.");
        router.refresh();
      } catch { setMessage("Couldn't reach Grind. Please try again."); }
    });
  }
  return <form action={save} className="flex flex-col gap-4">
    {!enabled && <p className="text-muted-foreground text-sm">Email delivery hasn&apos;t been configured yet.</p>}
    {!verified && <p className="text-sm">Verify your email to receive weekly updates. <Link className="underline" href={`/verify-email?${new URLSearchParams({ email })}`}>Send verification email</Link></p>}
    <label className="flex items-start gap-3"><input type="checkbox" name="weeklyRecap" defaultChecked={preferences.weeklyRecap} disabled={!verified || !enabled} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b>Weekly training recap</b><br /><span className="text-muted-foreground">Mondays at 07:00: running, strength, completed workouts and habits.</span></span></label>
    <label className="flex items-start gap-3"><input type="checkbox" name="weeklyPreview" defaultChecked={preferences.weeklyPreview} disabled={!verified || !enabled} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b>Your week ahead</b><br /><span className="text-muted-foreground">Sundays at 17:00: your upcoming sessions and weekly focus.</span></span></label>
    <div className="space-y-2"><Label htmlFor="email-timezone">Your time zone</Label><Input id="email-timezone" value={zone} onChange={(e) => setZone(e.target.value)} required placeholder="e.g. Europe/London" />
      <Button type="button" size="sm" variant="outline" onClick={() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}>Use this device&apos;s time zone</Button>
      <p className="text-muted-foreground text-xs">Both emails follow this time zone. Delivery may take up to 15 minutes after the scheduled time. Changing it also changes how Grind determines today.</p>
    </div>
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save email preferences"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    <p className="text-muted-foreground text-xs">Account verification, password reset and security emails are sent when needed.</p>
  </form>;
}
