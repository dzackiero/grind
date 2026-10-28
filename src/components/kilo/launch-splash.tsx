"use client";

import { useEffect } from "react";
import { LAUNCH_SPLASH_MIN_MS } from "@/lib/launch-splash";
import { BrandLoader } from "./brand-loader";

/**
 * The animated opening screen of the installed app. The markup is always in the page, but the CSS keeps it
 * hidden unless the script in the root layout turned it on before the first paint. Once the app is running
 * this fades it out after a short minimum, so the animation is seen.
 */
export function LaunchSplash() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-splash")) return;
    let removal: ReturnType<typeof setTimeout>;
    const fadeOut = setTimeout(() => {
      root.setAttribute("data-splash", "out");
      removal = setTimeout(() => root.removeAttribute("data-splash"), 350);
    }, LAUNCH_SPLASH_MIN_MS);
    return () => {
      clearTimeout(fadeOut);
      clearTimeout(removal);
    };
  }, []);

  return (
    <div id="launch-splash" aria-hidden="true">
      <BrandLoader size={96} label="" />
    </div>
  );
}
