"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/kilo/error-panel";
import { Button } from "@/components/ui/button";
import "./globals.css";

/**
 * Last resort: runs when the root layout itself fails, so it replaces it and must bring its own <html> and <body>.
 * No theme provider is available here, so the saved theme is applied by hand (dark unless the user chose light or the
 * system): by a script before paint, and again after hydration because React rebuilds <html> and drops the class.
 * Plain <a> instead of Link on purpose: a full page load gets the app back on its feet.
 */
function applyTheme() {
  const root = document.documentElement;
  try {
    let theme = localStorage.getItem("theme") || "dark";
    if (theme === "system") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.classList.add(theme);
  } catch {
    root.classList.add("dark");
  }
}
const THEME_SCRIPT = `(${applyTheme.toString()})()`;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  useEffect(applyTheme, []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ErrorPanel fullPage title="Something went wrong" description="Grind hit a snag loading this page. Please try again." digest={error.digest}>
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline"><a href="/today">Back to Today</a></Button>
        </ErrorPanel>
      </body>
    </html>
  );
}
