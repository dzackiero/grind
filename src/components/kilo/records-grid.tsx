import { EFFORT_DISTANCES, formatEffort, type EffortKey } from "@/lib/efforts";
import type { PersonalRecord } from "@/server/progress/service";
import { PlateBadge } from "./plate-badge";
import { shortDate } from "./format";

const NAMES: Record<EffortKey, string> = {
  "1k": "1K",
  "1mi": "1 mile",
  "2mi": "2 miles",
  "5k": "5K",
  "5mi": "5 miles",
  "10k": "10K",
  half: "Half marathon",
  marathon: "Marathon",
};

/**
 * One plate per standard distance. Earned plates show the time and the day of the run.
 * A distance not run yet stays flat; the plan's goal distance says so with the race day.
 */
export function RecordsGrid({
  records,
  goal,
  raceDate,
}: {
  records: Partial<Record<EffortKey, PersonalRecord>>;
  /** The plan's goal distance, if there is a plan */
  goal?: "5k" | "10k" | "half" | "marathon";
  raceDate?: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6">
      {EFFORT_DISTANCES.map((d) => {
        const record = records[d.key];
        const isGoal = d.key === goal;
        return (
          <PlateBadge
            key={d.key}
            label={d.label}
            name={NAMES[d.key]}
            plate={d.plate}
            locked={!record}
            tag={!record && isGoal ? "GOAL" : undefined}
            value={record ? formatEffort(record.seconds) : "—"}
            caption={
              record
                ? shortDate(record.date)
                : isGoal && raceDate
                  ? `Race ${shortDate(raceDate)}`
                  : "Not yet"
            }
          />
        );
      })}
    </div>
  );
}
