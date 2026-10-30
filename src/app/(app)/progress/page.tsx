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
import { HabitsPanel } from "@/components/kilo/habits-panel";
import {
  getViewerHabits,
  getViewerIntervals,
  getViewerProgress,
  getViewerToday,
  requireViewerPlan,
} from "@/server/queries";

export const metadata = { title: "Progress · Grind" };

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    year?: string;
    month?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const tab: ProgressTab =
    params.tab === "performance" ? "performance" : params.tab === "habits" ? "habits" : "workouts";
  const filters = {
    type: params.type,
    year: Number(params.year) || undefined,
    month: Number(params.month) || undefined,
    page: Number(params.page) || undefined,
  };
  if (tab === "habits") {
    const [habits, today] = await Promise.all([getViewerHabits(), getViewerToday()]);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-3xl font-extrabold">Progress</h1>
        <ProgressNavigation tab={tab} />
        <HabitsPanel habits={habits} today={today} />
      </div>
    );
  }
  if (tab === "workouts") {
    const user = await requireViewer();
    const result = await listWorkoutHistory(await getDb(), user.id, filters);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-3xl font-extrabold">Progress</h1>
        <ProgressNavigation tab={tab} />
        <WorkoutHistory result={result} filters={filters} />
      </div>
    );
  }
  const [{ plan }, progress, intervals] = await Promise.all([
    requireViewerPlan(),
    getViewerProgress(),
    getViewerIntervals(),
  ]);
  const hasActivity = progress.weeks.some((w) => w.runs > 0 || w.strength > 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-extrabold">Progress</h1>
      <ProgressNavigation tab={tab} />

      <TierCard status={progress.points} />

      <Card>
        <CardHeader>
          <CardTitle>Weekly volume</CardTitle>
          <CardDescription>
            What your watch recorded, the last 12 weeks. Tap a bar to see that week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasActivity ? (
            <WeeklyVolume weeks={progress.weeks} />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-muted-foreground text-sm">
                {intervals.connected
                  ? "No runs or strength sessions in the last 12 weeks yet. They show up here after your watch syncs."
                  : "Connect intervals.icu to see what you run each week."}
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
          <CardTitle>Personal records</CardTitle>
          <CardDescription>
            Your fastest time over each distance, found inside your runs. Treadmill runs don&apos;t
            count.
          </CardDescription>
        </CardHeader>
        <CardContent layout="stack" gap="5">
          <RecordsGrid records={progress.records} goal={plan.goal} raceDate={plan.raceDate} />
          {progress.toCheck > 0 && (
            <div className="bg-secondary flex flex-col items-start gap-3 rounded-md p-3">
              <p className="text-muted-foreground text-sm">
                Older runs are checked in batches. {progress.toCheck} still to go, so a faster
                record may be hiding in them.
              </p>
              <CheckRunsButton pending={progress.toCheck} />
            </div>
          )}
          {!intervals.connected && (
            <p className="text-muted-foreground text-sm">
              Records come from your watch data. Connect intervals.icu in Settings to fill these in.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ProgressTab = "workouts" | "habits" | "performance";
const PROGRESS_TABS: { tab: ProgressTab; label: string; href: string }[] = [
  { tab: "workouts", label: "Workouts", href: "/progress" },
  { tab: "habits", label: "Habits", href: "/progress?tab=habits" },
  { tab: "performance", label: "Performance", href: "/progress?tab=performance" },
];

function ProgressNavigation({ tab }: { tab: ProgressTab }) {
  return (
    <nav
      aria-label="Progress sections"
      className="border-border flex gap-6 border-b text-sm font-medium"
    >
      {PROGRESS_TABS.map((t) => (
        <Link
          key={t.tab}
          href={t.href}
          aria-current={t.tab === tab ? "page" : undefined}
          className={`border-b-2 px-1 py-3 ${t.tab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
