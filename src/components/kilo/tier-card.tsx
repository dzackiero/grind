import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { TierKey } from "@/lib/points";
import type { PointsStatus } from "@/server/progress/service";
import { Stat } from "./stat";

const TIER_FILL: Record<TierKey, string> = {
  bronze: "fill-tier-bronze",
  silver: "fill-tier-silver",
  gold: "fill-tier-gold",
  platinum: "fill-tier-platinum",
  lime: "fill-tier-lime",
};

/** Octagon medal in the tier's colour with the Grind K. */
export function TierMedal({ tier, className }: { tier: TierKey; className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={cn("size-14 shrink-0", className)} aria-hidden>
      <path d="M20 2h16l14 14v24L36 54H20L6 40V16z" className={TIER_FILL[tier]} />
      <text
        x="28"
        y="36"
        textAnchor="middle"
        className="fill-on-type font-display text-2xl font-black"
      >
        G
      </text>
    </svg>
  );
}

/** Points, the tier they reach, how far the next tier is, and the weekly streak. */
export function TierCard({ status }: { status: PointsStatus }) {
  const { tier, next, remaining, progress } = status.tier;
  return (
    <Card>
      <CardContent layout="stack" gap="5">
        <div className="flex items-center gap-4">
          <TierMedal tier={tier.key} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="kilo-label">Your tier</span>
            <span className="font-display text-xl leading-6 font-extrabold">
              {tier.name}{" "}
              <span className="text-muted-foreground font-sans text-base font-semibold tabular-nums">
                · {status.points.toLocaleString("en-US")} pts
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Progress
            value={Math.round(progress * 100)}
            aria-label={
              next
                ? `${Math.round(progress * 100)}% of the way to ${next.name}`
                : "Top tier reached"
            }
            tier={tier.key}
          />
          <p className="text-muted-foreground text-sm">
            {next ? (
              <>
                <b className="text-foreground tabular-nums">
                  {remaining.toLocaleString("en-US")} pts
                </b>{" "}
                to {next.name}. Finish your planned workouts to climb; every week you complete earns
                a bonus.
              </>
            ) : (
              "You're at the top tier. Keep your weekly streak going to stay there."
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label="Streak"
            value={status.streak}
            unit={status.streak === 1 ? "week" : "weeks"}
          />
          <Stat label="Workouts" value={status.completedWorkouts} unit="done" />
          <Stat label="Weeks hit" value={status.weeksHit} />
        </div>
      </CardContent>
    </Card>
  );
}
