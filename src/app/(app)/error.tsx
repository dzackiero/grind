"use client";

import { ErrorBoundaryContent } from "@/components/kilo/error-boundary-content";

/** Errors inside the app: the header and tab bar belong to the layout, so they stay while the page shows this. */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent {...props} />;
}
