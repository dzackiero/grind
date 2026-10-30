import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a tab is tapped, while the page's data loads on the server. Without it the previous page
 * stays on screen until the server answers, which feels like the app froze. The header and tab bar belong to
 * the layout, so they stay put. Placeholders only: the moving brand mark is for the opening screen of the app.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      <Skeleton shape="title" />
      <Skeleton shape="bar" />
      <Skeleton shape="card" />
      <Skeleton shape="card" />
      <Skeleton shape="card-sm" />
    </div>
  );
}
