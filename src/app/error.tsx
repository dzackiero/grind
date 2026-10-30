"use client";

import { ErrorBoundaryContent } from "@/components/kilo/error-boundary-content";

/** Errors outside the signed-in app (sign-in, onboarding, ...). The root layout is still there, so theme and fonts work. */
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent {...props} fullPage />;
}
