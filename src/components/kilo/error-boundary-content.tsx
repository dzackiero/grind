"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "./error-panel";

/** Body of error.tsx, in and outside the app shell: logs the error, offers another go and a way back to Today. */
export function ErrorBoundaryContent({
  error,
  reset,
  fullPage,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  fullPage?: boolean;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorPanel
      fullPage={fullPage}
      title="Something went wrong"
      description="Grind hit a snag loading this page. Please try again."
      digest={error.digest}
    >
      <Button onClick={reset}>Try again</Button>
      <Button asChild variant="outline">
        <Link href="/today">Back to Today</Link>
      </Button>
    </ErrorPanel>
  );
}
