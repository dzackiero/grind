import { formatPace } from "./paces";
import type { PaceZones, RunWorkout, SimpleStep, Step } from "./schema";
import { HILLS, INTERVALS, TEMPO, type RepeatSet } from "./templates";
import type { PlanInput } from "./schema";

type Zone = keyof PaceZones;
type RunDraft = Omit<RunWorkout, "id" | "date" | "distanceKm" | "estDurationMin">;

export const round05 = (km: number) => Math.round(km * 2) / 2;

function mid(p: PaceZones, zone: Zone): number {
  return (p[zone].minSecPerKm + p[zone].maxSecPerKm) / 2;
}

function target(p: PaceZones, zone: Zone) {
  return { zone, pace: p[zone] };
}

/** Recovery jogs run a little slower than easy pace. */
function jogPace(p: PaceZones): number {
  return p.E.maxSecPerKm + 20;
}

function simpleDistanceM(step: SimpleStep, p: PaceZones): number {
  if (step.distanceM) return step.distanceM;
  const pace = step.kind === "recovery" ? jogPace(p) : step.target ? mid(p, step.target.zone) : mid(p, "E");
  return ((step.durationSec ?? 0) / pace) * 1000;
}

function simpleDurationSec(step: SimpleStep, p: PaceZones): number {
  if (step.durationSec) return step.durationSec;
  const pace = step.kind === "recovery" ? jogPace(p) : step.target ? mid(p, step.target.zone) : mid(p, "E");
  return ((step.distanceM ?? 0) / 1000) * pace;
}

export function stepsDistanceKm(steps: Step[], p: PaceZones): number {
  let m = 0;
  for (const s of steps) {
    if (s.kind === "repeat") m += s.times * s.steps.reduce((a, x) => a + simpleDistanceM(x, p), 0);
    else m += simpleDistanceM(s, p);
  }
  return m / 1000;
}

export function stepsDurationMin(steps: Step[], p: PaceZones): number {
  let sec = 0;
  for (const s of steps) {
    if (s.kind === "repeat") sec += s.times * s.steps.reduce((a, x) => a + simpleDurationSec(x, p), 0);
    else sec += simpleDurationSec(s, p);
  }
  return sec / 60;
}

/** Turn a draft into a full workout with distance and duration worked out from its steps. */
export function finishRun(draft: RunDraft, id: string, date: string, p: PaceZones): RunWorkout {
  return {
    ...draft,
    id,
    date,
    distanceKm: round05(stepsDistanceKm(draft.steps, p)),
    estDurationMin: Math.round(stepsDurationMin(draft.steps, p)),
  };
}

function warmCool(level: PlanInput["experience"], p: PaceZones) {
  const short = level === "beginner";
  return {
    warmup: { kind: "warmup", distanceM: short ? 1500 : 2000, target: target(p, "E") } satisfies SimpleStep,
    cooldown: { kind: "cooldown", distanceM: short ? 1000 : 1500, target: target(p, "E") } satisfies SimpleStep,
  };
}

const fmtMeters = (m: number) => (m >= 1000 && m % 1000 === 0 ? `${m / 1000}km` : `${m}m`);
const fmtRest = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec}s`);

// ---------- Builders ----------

export function easyRun(km: number, p: PaceZones): RunDraft {
  const k = round05(km);
  return {
    kind: "run",
    type: "easy",
    title: `${k}km Easy Run`,
    description: `Relaxed, conversational running at ${formatPace(p.E.minSecPerKm)}–${formatPace(p.E.maxSecPerKm)}/km. You should be able to talk in full sentences.`,
    steps: [{ kind: "steady", distanceM: k * 1000, target: target(p, "E") }],
  };
}

export function intervalRun(set: RepeatSet, level: PlanInput["experience"], p: PaceZones): RunDraft {
  const reps = level === "beginner" ? Math.max(3, set.reps - 1) : set.reps;
  const { warmup, cooldown } = warmCool(level, p);
  return {
    kind: "run",
    type: "intervals",
    title: `${reps} × ${fmtMeters(set.meters)} Intervals`,
    description: `${reps} repeats of ${fmtMeters(set.meters)} at ${formatPace(p[set.zone].minSecPerKm)}–${formatPace(p[set.zone].maxSecPerKm)}/km with ${fmtRest(set.recoverySec)} easy jog between. Hard but controlled: the last rep should match the first.`,
    steps: [
      warmup,
      {
        kind: "repeat",
        times: reps,
        steps: [
          { kind: "work", distanceM: set.meters, target: target(p, set.zone) },
          { kind: "recovery", durationSec: set.recoverySec, note: "Easy jog" },
        ],
      },
      cooldown,
    ],
  };
}

export function tempoRun(index: number, level: PlanInput["experience"], p: PaceZones): RunDraft {
  const s = TEMPO[Math.min(index, TEMPO.length - 1)];
  const { warmup, cooldown } = warmCool(level, p);
  const pace = `${formatPace(p.T.minSecPerKm)}–${formatPace(p.T.maxSecPerKm)}/km`;
  if (s.kind === "continuous") {
    return {
      kind: "run",
      type: "tempo",
      title: `${s.minutes} min Tempo Run`,
      description: `${s.minutes} minutes at threshold pace (${pace}). Comfortably hard: you can say a few words, not hold a conversation.`,
      steps: [warmup, { kind: "work", durationSec: s.minutes * 60, target: target(p, "T") }, cooldown],
    };
  }
  return {
    kind: "run",
    type: "tempo",
    title: `${s.reps} × ${s.minutes} min Tempo`,
    description: `${s.reps} blocks of ${s.minutes} minutes at threshold pace (${pace}) with ${fmtRest(s.recoverySec)} easy jog between.`,
    steps: [
      warmup,
      {
        kind: "repeat",
        times: s.reps,
        steps: [
          { kind: "work", durationSec: s.minutes * 60, target: target(p, "T") },
          { kind: "recovery", durationSec: s.recoverySec, note: "Easy jog" },
        ],
      },
      cooldown,
    ],
  };
}

export function hillRun(index: number, level: PlanInput["experience"], p: PaceZones): RunDraft {
  const s = HILLS[Math.min(index, HILLS.length - 1)];
  const { warmup, cooldown } = warmCool(level, p);
  return {
    kind: "run",
    type: "hills",
    title: `${s.reps} × ${s.seconds}s Hills`,
    description: `Find a steady hill. Run up hard for ${s.seconds} seconds with tall posture and quick arms, then jog back down to recover.`,
    steps: [
      warmup,
      {
        kind: "repeat",
        times: s.reps,
        steps: [
          { kind: "work", durationSec: s.seconds, target: { zone: "I", effort: "Hard uphill" } },
          { kind: "recovery", durationSec: Math.round(s.seconds * 1.5), note: "Jog back down" },
        ],
      },
      cooldown,
    ],
  };
}

/** Short session at race pace for taper weeks. */
export function sharpener(goal: PlanInput["goal"], raceWeek: boolean, level: PlanInput["experience"], p: PaceZones): RunDraft {
  const reps = 3;
  const meters = raceWeek ? 1000 : { "5k": 800, "10k": 1000, half: 1600, marathon: 2000 }[goal];
  const { warmup, cooldown } = warmCool(level, p);
  return {
    kind: "run",
    type: "intervals",
    title: raceWeek ? "Race Week Tune-up" : `${reps} × ${fmtMeters(meters)} at Race Pace`,
    description: `${reps} × ${fmtMeters(meters)} at goal race pace (${formatPace(p.race.minSecPerKm)}–${formatPace(p.race.maxSecPerKm)}/km). Stay relaxed and save the effort for race day.`,
    steps: [
      warmup,
      {
        kind: "repeat",
        times: reps,
        steps: [
          { kind: "work", distanceM: meters, target: target(p, "race") },
          { kind: "recovery", durationSec: 120, note: "Easy jog" },
        ],
      },
      cooldown,
    ],
  };
}

export type LongVariant = "easy" | "progressive" | "race_finish" | "marathon_pace";

export function longRun(km: number, variant: LongVariant, p: PaceZones): RunDraft {
  const k = round05(km);
  if (variant === "easy") {
    return {
      kind: "run",
      type: "long",
      title: `${k}km Long Run`,
      description: `Easy pace the whole way (${formatPace(p.E.minSecPerKm)}–${formatPace(p.E.maxSecPerKm)}/km). Practise drinking and fuelling on longer runs.`,
      steps: [{ kind: "steady", distanceM: k * 1000, target: target(p, "E") }],
    };
  }
  if (variant === "progressive") {
    const fast = Math.max(1, round05(k * 0.25));
    return {
      kind: "run",
      type: "long",
      title: `${k}km Progressive Long Run`,
      description: `Start easy, then run the last ${fast}km at marathon effort (${formatPace(p.M.minSecPerKm)}–${formatPace(p.M.maxSecPerKm)}/km).`,
      steps: [
        { kind: "steady", distanceM: (k - fast) * 1000, target: target(p, "E") },
        { kind: "steady", distanceM: fast * 1000, target: target(p, "M") },
      ],
    };
  }
  if (variant === "race_finish") {
    const fast = Math.min(5, Math.max(2, round05(k * 0.25)));
    return {
      kind: "run",
      type: "long",
      title: `${k}km Long Run, Fast Finish`,
      description: `Easy running, then the last ${fast}km at goal race pace (${formatPace(p.race.minSecPerKm)}–${formatPace(p.race.maxSecPerKm)}/km).`,
      steps: [
        { kind: "steady", distanceM: (k - fast) * 1000, target: target(p, "E") },
        { kind: "steady", distanceM: fast * 1000, target: target(p, "race") },
      ],
    };
  }
  const mp = Math.min(14, Math.max(4, round05(k * 0.35)));
  const warm = round05((k - mp) * 0.6);
  return {
    kind: "run",
    type: "long",
    title: `${k}km Long Run with ${mp}km at Marathon Pace`,
    description: `${warm}km easy, ${mp}km at marathon pace (${formatPace(p.M.minSecPerKm)}–${formatPace(p.M.maxSecPerKm)}/km), then easy to finish. Rehearse your race-day fuelling.`,
    steps: [
      { kind: "steady", distanceM: warm * 1000, target: target(p, "E") },
      { kind: "steady", distanceM: mp * 1000, target: target(p, "M") },
      { kind: "steady", distanceM: round05(k - warm - mp) * 1000, target: target(p, "E") },
    ],
  };
}

export function raceDay(label: string, distanceM: number, p: PaceZones): RunDraft {
  return {
    kind: "run",
    type: "race",
    title: `Race Day: ${label}`,
    description: `Start at ${formatPace(p.race.maxSecPerKm)}/km for the first kilometers, settle into goal pace, and finish strong. Trust the training.`,
    steps: [{ kind: "work", distanceM, target: target(p, "race") }],
  };
}

export { INTERVALS };
