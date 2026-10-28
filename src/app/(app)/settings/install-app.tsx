"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pwaInstall } from "@/lib/pwa-install";

/** Installing Grind on the home screen: a button where the browser allows it, instructions elsewhere. */
export function InstallApp() {
  const { prompt, installed } = useSyncExternalStore(pwaInstall.subscribe, pwaInstall.getSnapshot, pwaInstall.getServerSnapshot);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  if (installed)
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="text-success size-5" /> Grind is installed on this device.
      </p>
    );

  if (prompt)
    return (
      <Button size="lg" onClick={() => void pwaInstall.install()}>
        <Download /> Install Grind
      </Button>
    );

  return ios ? (
    <p className="text-muted-foreground text-sm">
      In Safari, tap <Share className="mx-0.5 inline size-4 align-text-bottom" /> <b className="text-foreground">Share</b>, then <b className="text-foreground">Add to Home Screen</b>.
    </p>
  ) : (
    <p className="text-muted-foreground text-sm">
      Open your browser&apos;s menu and choose <b className="text-foreground">Install Grind</b> or <b className="text-foreground">Add to Home Screen</b>.
    </p>
  );
}
