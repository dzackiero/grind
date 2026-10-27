import Link from "next/link";
import { Activity, ChevronRight, HeartPulse, Moon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shortDate } from "./format";
import { Stat } from "./stat";

export interface WellnessSummary {
  date: string;
  hrv: number | null;
  restingHr: number | null;
  sleepSecs: number | null;
  sleepScore: number | null;
  ctl: number | null;
  atl: number | null;
  hrvBaseline: number | null;
  restingHrBaseline: number | null;
}

/** Form = fitness − fatigue (intervals.icu CTL − ATL). Negative means tired from recent training. */
function formLabel(form: number) {
  if (form > 5) return { text: "Fresh", tone: "text-success" };
  if (form >= -10) return { text: "Balanced", tone: "text-foreground" };
  if (form >= -30) return { text: "Building fitness", tone: "text-warning" };
  return { text: "Very tired", tone: "text-destructive" };
}

function delta(value: number | null, baseline: number | null, unit: string, higherIsBetter: boolean) {
  if (value == null || baseline == null) return null;
  const d = Math.round(value - baseline);
  if (d === 0) return "same as your 7-day average";
  const good = higherIsBetter ? d > 0 : d < 0;
  return <span className={good ? "text-success" : "text-warning"}>{`${d > 0 ? "+" : ""}${d} ${unit} vs 7-day average`}</span>;
}

/** Recovery from intervals.icu wellness: resting HR, form, and HRV/sleep when the watch provides them. */
export function RecoveryCard({ wellness, connected }: { wellness: WellnessSummary | null; connected: boolean }) {
  if (!connected) {
    return (
      <Link href="/settings" className="group">
        <Card className="group-hover:border-line-strong">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base font-semibold">
              Connect intervals.icu <ChevronRight className="text-muted-foreground size-5" />
            </CardTitle>
            <CardDescription>Bring in your Huawei runs, resting heart rate and training load. Workouts tick off automatically.</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    );
  }
  if (!wellness) return null;

  // Real-world fitness (CTL) stays under ~200. Far above that, intervals.icu's load settings are off
  // (usually threshold pace), so the number would mislead.
  const loadLooksWrong = wellness.ctl != null && wellness.ctl > 250;
  const form = !loadLooksWrong && wellness.ctl != null && wellness.atl != null ? Math.round(wellness.ctl - wellness.atl) : null;
  const label = form != null ? formLabel(form) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recovery</CardTitle>
        <CardDescription>From your watch via intervals.icu · {shortDate(wellness.date)}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        {wellness.restingHr != null && (
          <Stat
            label="Resting HR"
            value={
              <span className="inline-flex items-center gap-1.5">
                <HeartPulse className="text-type-race-mark size-5" />
                {Math.round(wellness.restingHr)}
              </span>
            }
            unit="bpm"
            hint={delta(wellness.restingHr, wellness.restingHrBaseline, "bpm", false)}
          />
        )}
        {form != null && label && (
          <Stat
            label="Form"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Activity className="text-accent-ink size-5" />
                {form > 0 ? `+${form}` : form}
              </span>
            }
            hint={
              <>
                <span className={label.tone}>{label.text}</span> · fitness {Math.round(wellness.ctl!)}, fatigue {Math.round(wellness.atl!)}
              </>
            }
          />
        )}
        {wellness.hrv != null && <Stat label="HRV" value={Math.round(wellness.hrv)} unit="ms" hint={delta(wellness.hrv, wellness.hrvBaseline, "ms", true)} />}
        {wellness.sleepSecs != null && (
          <Stat
            label="Sleep"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Moon className="text-type-long-mark size-5" />
                {(wellness.sleepSecs / 3600).toFixed(1)}
              </span>
            }
            unit="h"
            hint={wellness.sleepScore != null ? `Score ${Math.round(wellness.sleepScore)}` : undefined}
          />
        )}
        {loadLooksWrong && (
          <p className="text-muted-foreground col-span-2 text-xs">
            Fitness and form are hidden: intervals.icu reports a fitness of {Math.round(wellness.ctl!)}, which usually means the threshold pace in
            intervals.icu → Settings → Run is set too fast. Fix it there and run a recalculation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
