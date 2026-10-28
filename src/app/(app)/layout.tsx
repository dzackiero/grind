import { AccountMenu } from "@/components/kilo/account-menu";
import { AutoSync } from "@/components/kilo/auto-sync";
import { TabBar } from "@/components/kilo/tab-bar";
import { getDb } from "@/server/db";
import { getIntervalsStatus } from "@/server/intervals/sync";
import { requireViewer, requireViewerPlan } from "@/server/queries";

/** Signed-in app with a plan: header, page, bottom tabs. */
// These pages read the signed-in athlete, so they are rendered per request and never during the build.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireViewer();
  await requireViewerPlan();
  const intervals = await getIntervalsStatus(await getDb(), user.id);
  return (
    <div className="isolate mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="bg-background sticky top-0 z-30 -mx-4 flex h-14 shrink-0 items-center justify-between border-b px-4">
        <AccountMenu name={user.name} email={user.email} />
        <span className="font-display text-lg font-extrabold">Grind</span>
        <span className="size-11" aria-hidden />
      </header>
      <main className="relative z-0 min-w-0 flex-1 pt-5">{children}</main>
      <TabBar />
      <AutoSync connected={intervals.connected} lastSyncedAt={intervals.lastSyncedAt} />
    </div>
  );
}
