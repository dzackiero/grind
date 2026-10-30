import type { Route } from "@/lib/activity-detail";

/**
 * The run's route drawn on its own, without a street map: no map tiles means no map provider account,
 * and nothing about where the athlete runs is sent to a third party.
 */
export function ActivityRoute({ route }: { route: Route }) {
  return (
    <div className="bg-secondary flex h-56 items-center justify-center rounded-xl p-4">
      <svg
        viewBox="-4 -4 108 108"
        className="size-full"
        role="img"
        aria-label="Route of this run"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={route.path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={route.start.x}
          cy={route.start.y}
          r="2.6"
          className="fill-success stroke-background"
          strokeWidth="1"
        />
        <circle
          cx={route.end.x}
          cy={route.end.y}
          r="2.6"
          className="fill-destructive stroke-background"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
