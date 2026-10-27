import { AccountMenu } from "@/components/kilo/account-menu";
import { AutoSync } from "@/components/kilo/auto-sync";
import { TabBar } from "@/components/kilo/tab-bar";
import { getDb } from "@/server/db";
import { getIntervalsStatus } from "@/server/intervals/sync";
import { requireViewer, requireViewerPlan } from "@/server/queries";

/** Signed-in app with a plan: header, page, bottom tabs. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireViewer();
  await requireViewerPlan();
  const intervals = await getIntervalsStatus(await getDb(), user.id);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-28">
      <header className="bg-background sticky top-0 z-10 flex h-14 items-center justify-between">
        <AccountMenu name={user.name} email={user.email} />
        <span className="font-display text-lg font-extrabold">Kilo</span>
        <span className="size-11" aria-hidden />
      </header>
      {children}
      <TabBar />
      <AutoSync connected={intervals.connected} lastSyncedAt={intervals.lastSyncedAt} />
    </div>
  );
}
