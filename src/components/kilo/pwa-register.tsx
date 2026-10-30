"use client";

import { useEffect } from "react";
import { pwaInstall } from "@/lib/pwa-install";

/**
 * Registers the service worker (public/sw.js) so Grind can be installed and shows an offline page.
 * Production only: in development a worker would keep serving old files and make changes look broken.
 */
export function PwaRegister() {
  useEffect(() => {
    const stop = pwaInstall.start();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Not fatal: the app works the same without it
        });
    }
    return stop;
  }, []);
  return null;
}
