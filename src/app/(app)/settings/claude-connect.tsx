"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, Unplug } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/components/kilo/format";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConnectedApp {
  clientId: string;
  name: string;
  canEdit: boolean;
  lastConnected: string;
}

export function ClaudeConnect({ mcpUrl, isLocal, apps }: { mcpUrl: string; isLocal: boolean; apps: ConnectedApp[] }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the address and copy it.");
    }
  }

  const disconnect = (app: ConnectedApp) =>
    startTransition(async () => {
      const res = await fetch(`/api/mcp-connections/${encodeURIComponent(app.clientId)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't disconnect. Try again.");
        return;
      }
      toast.success(`${app.name} can no longer see or change your plan.`);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>
          In Claude, open <b className="text-foreground">Settings → Connectors → Add custom connector</b>
        </li>
        <li>Paste this address and connect</li>
        <li>Sign in to Kilo and choose what Claude can do</li>
      </ol>
      <div className="flex gap-2">
        <Input readOnly value={mcpUrl} aria-label="Kilo connector address" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="outline" size="icon" onClick={copy} aria-label="Copy address">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      {isLocal && (
        <Alert>
          <AlertDescription>This address only works on your computer. Claude needs a public https address, so connect it after Kilo is deployed.</AlertDescription>
        </Alert>
      )}

      {apps.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="kilo-label">Connected</h3>
          <ul className="flex flex-col gap-2">
            {apps.map((app) => (
              <li key={app.clientId} className="bg-secondary flex items-center gap-3 rounded-md py-2 pr-2 pl-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{app.name}</span>
                  <span className="text-muted-foreground text-xs">Last connected {timeAgo(app.lastConnected)}</span>
                </span>
                <Badge variant="secondary">{app.canEdit ? "Plan and coaching edits" : "Read only"}</Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" disabled={pending} aria-label={`Disconnect ${app.name}`}>
                      <Unplug />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect {app.name}?</AlertDialogTitle>
                      <AlertDialogDescription>It loses access to your plan and training data straight away. You can connect it again later.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep connected</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => disconnect(app)}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
