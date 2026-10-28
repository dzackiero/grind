import Link from "next/link";
import { WorkoutHistory } from "@/components/kilo/workout-history";
import { getDb } from "@/server/db";
import { listWorkoutHistory } from "@/server/progress/history-list";
import { requireViewer } from "@/server/queries";
import { CheckRunsButton } from "@/components/kilo/check-runs-button";
import { RecordsGrid } from "@/components/kilo/records-grid";
import { TierCard } from "@/components/kilo/tier-card";
import { WeeklyVolume } from "@/components/kilo/weekly-volume";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewerIntervals, getViewerProgress, requireViewerPlan } from "@/server/queries";

export const metadata = { title: "Progress · Kilo" };

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ tab?: string; type?: string; year?: string; month?: string; page?: string }> }) {
  const params = await searchParams;
  const performance = params.tab === "performance";
  const filters = { type: params.type, year: Number(params.year) || undefined, month: Number(params.month) || undefined, page: Number(params.page) || undefined };
  if (!performance) {
    const user = await requireViewer();
    const result = await listWorkoutHistory(await getDb(), user.id, filters);
    return <div className="flex flex-col gap-6"><h1 className="font-display text-3xl font-extrabold">Progress</h1><ProgressNavigation performance={false} /><WorkoutHistory result={result} filters={filters} /></div>;
  }
  const [{ plan }, progress, intervals] = await Promise.all([requireViewerPlan(), getViewerProgress(), getViewerIntervals()]);
  const hasActivity = progress.weeks.some((w) => w.runs > 0 || w.strength > 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold">Progress</h1>
      <ProgressNavigation performance />

      <TierCard status={progress.points} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Weekly volume</CardTitle>
          <CardDescription>What your watch recorded, the last 12 weeks. Tap a bar to see that week.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasActivity ? (
            <WeeklyVolume weeks={progress.weeks} />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">
                {intervals.connected ? "No runs or strength sessions in the last 12 weeks yet. They show up here after your watch syncs." : "Connect intervals.icu to see what you run each week."}
              </p>
              {!intervals.connected && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings">Connect intervals.icu</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Personal records</CardTitle>
          <CardDescription>Your fastest time over each distance, found inside your runs. Treadmill runs don&apos;t count.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <RecordsGrid records={progress.records} goal={plan.goal} raceDate={plan.raceDate} />
          {progress.toCheck > 0 && (
            <div className="bg-secondary flex flex-col items-start gap-3 rounded-md p-3">
              <p className="text-muted-foreground text-[13px]">Older runs are checked in batches. {progress.toCheck} still to go, so a faster record may be hiding in them.</p>
              <CheckRunsButton pending={progress.toCheck} />
            </div>
          )}
          {!intervals.connected && <p className="text-muted-foreground text-sm">Records come from your watch data. Connect intervals.icu in Settings to fill these in.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressNavigation({ performance }: { performance: boolean }) {
  return <nav aria-label="Progress sections" className="border-border flex gap-6 border-b text-sm font-medium">
    <Link href="/progress" aria-current={!performance ? "page" : undefined} className={`border-b-2 px-1 pb-3 ${!performance ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>Workouts</Link>
    <Link href="/progress?tab=performance" aria-current={performance ? "page" : undefined} className={`border-b-2 px-1 pb-3 ${performance ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>Performance</Link>
  </nav>;
}
