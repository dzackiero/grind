import type { Exercise, PlanInput, StrengthWorkout, Week } from "./schema";
import { STRENGTH_FOCUS_LABELS } from "./strength-focus";

type Focus = StrengthWorkout["focus"];
type Phase = Week["phase"];
type Equipment = PlanInput["strength"]["equipment"];
type Group = Exercise["group"];

/** Strength phase that follows the running phase. */
type StrengthBlock = "foundation" | "strength" | "power" | "maintenance";

export function strengthBlock(phase: Phase): StrengthBlock {
  return { base: "foundation", build: "strength", peak: "power", taper: "maintenance", recovery: "foundation" }[phase] as StrengthBlock;
}

/**
 * Which sessions to schedule for a given number of sessions per week.
 * 1–3 follow Runna's split; 4 is an upper/lower split twice; 5 adds a Full Body day.
 */
export function weeklySplit(sessions: number): Focus[] {
  const splits: Focus[][] = [
    [],
    ["full"],
    ["legs_core", "upper"],
    ["legs_core", "upper", "full"],
    ["legs_core", "upper", "legs_core", "upper"],
    ["legs_core", "upper", "full", "legs_core", "upper"],
  ];
  return splits[sessions] ?? [];
}

interface Move {
  id: string;
  gym: string;
  bodyweight: string;
  group: Group;
  /** main lifts get heavier loads; accessory and core moves stay moderate */
  role: "main" | "accessory" | "core" | "plyo";
  perSide?: boolean;
  /** core moves held for time */
  timed?: boolean;
  cue?: string;
}

const BASE_LIBRARY: Record<"legs_core" | "upper" | "full", Move[]> = {
  legs_core: [
    { id: "squat", gym: "Goblet squat", bodyweight: "Bodyweight squat", group: "A", role: "main", cue: "Sit between your heels, chest tall." },
    { id: "hinge", gym: "Romanian deadlift", bodyweight: "Single-leg glute bridge", group: "A", role: "main", perSide: false, cue: "Hips back, flat back, feel the hamstrings." },
    { id: "lunge", gym: "Dumbbell reverse lunge", bodyweight: "Reverse lunge", group: "B", role: "accessory", perSide: true, cue: "Knee tracks over the middle toes." },
    { id: "calf", gym: "Single-leg calf raise", bodyweight: "Single-leg calf raise", group: "B", role: "accessory", perSide: true, cue: "Slow down, pause at the top." },
    { id: "deadbug", gym: "Dead bug", bodyweight: "Dead bug", group: "C", role: "core", perSide: true, cue: "Lower back stays on the floor." },
    { id: "sideplank", gym: "Side plank", bodyweight: "Side plank", group: "C", role: "core", perSide: true, timed: true },
  ],
  upper: [
    { id: "push", gym: "Dumbbell bench press", bodyweight: "Push-up", group: "A", role: "main" },
    { id: "row", gym: "Single-arm dumbbell row", bodyweight: "Inverted row", group: "A", role: "main", perSide: false, cue: "Pull the elbow to your hip." },
    { id: "press", gym: "Half-kneeling dumbbell press", bodyweight: "Pike push-up", group: "B", role: "accessory" },
    { id: "pullapart", gym: "Band pull-apart", bodyweight: "Prone Y-T raise", group: "B", role: "accessory", cue: "Squeeze the shoulder blades together." },
    { id: "plank", gym: "Plank", bodyweight: "Plank", group: "C", role: "core", timed: true },
    { id: "antirotation", gym: "Pallof press", bodyweight: "Bird dog", group: "C", role: "core", perSide: true },
  ],
  full: [
    { id: "deadlift", gym: "Trap-bar deadlift", bodyweight: "Single-leg Romanian deadlift", group: "A", role: "main", cue: "Push the floor away." },
    { id: "pushup", gym: "Push-up", bodyweight: "Push-up", group: "A", role: "main" },
    { id: "stepup", gym: "Dumbbell step-up", bodyweight: "Step-up", group: "B", role: "accessory", perSide: true },
    { id: "row2", gym: "Dumbbell row", bodyweight: "Inverted row", group: "B", role: "accessory" },
    { id: "carry", gym: "Farmer carry", bodyweight: "Bear crawl", group: "C", role: "core", timed: true },
    { id: "hollow", gym: "Hollow hold", bodyweight: "Hollow hold", group: "C", role: "core", timed: true },
  ],
};

const LIBRARY: Record<Focus, Move[]> = {
  ...BASE_LIBRARY,
  lower: BASE_LIBRARY.legs_core.slice(0, 4),
  legs: BASE_LIBRARY.legs_core.slice(0, 4),
  push: [
    { id: "bench", gym: "Dumbbell bench press", bodyweight: "Push-up", group: "A", role: "main" },
    { id: "overhead", gym: "Seated dumbbell shoulder press", bodyweight: "Pike push-up", group: "A", role: "main" },
    { id: "incline", gym: "Incline dumbbell press", bodyweight: "Incline push-up", group: "B", role: "accessory" },
    { id: "triceps", gym: "Cable triceps extension", bodyweight: "Close-grip push-up", group: "B", role: "accessory" },
  ],
  pull: [
    { id: "row", gym: "Chest-supported dumbbell row", bodyweight: "Inverted row", group: "A", role: "main" },
    { id: "pulldown", gym: "Lat pulldown", bodyweight: "Prone lat pull-down", group: "A", role: "main" },
    { id: "reardelt", gym: "Reverse dumbbell fly", bodyweight: "Prone reverse fly", group: "B", role: "accessory" },
    { id: "curl", gym: "Dumbbell biceps curl", bodyweight: "Self-resisted biceps curl", group: "B", role: "accessory", perSide: true },
  ],
  core: [
    { id: "deadbug", gym: "Dead bug", bodyweight: "Dead bug", group: "A", role: "core", perSide: true },
    { id: "plank", gym: "Plank", bodyweight: "Plank", group: "A", role: "core", timed: true },
    { id: "sideplank", gym: "Side plank", bodyweight: "Side plank", group: "B", role: "core", perSide: true, timed: true },
    { id: "antirotation", gym: "Pallof press", bodyweight: "Bird dog", group: "B", role: "core", perSide: true },
  ],
  posterior_chain: [
    { id: "hinge", gym: "Romanian deadlift", bodyweight: "Single-leg Romanian deadlift", group: "A", role: "main", perSide: true },
    { id: "hipthrust", gym: "Barbell hip thrust", bodyweight: "Single-leg glute bridge", group: "A", role: "main", perSide: true },
    { id: "hamstring", gym: "Seated hamstring curl", bodyweight: "Hamstring walkout", group: "B", role: "accessory" },
    { id: "backextension", gym: "Back extension", bodyweight: "Prone back extension", group: "B", role: "accessory" },
  ],
  chest_back: [
    { id: "bench", gym: "Dumbbell bench press", bodyweight: "Push-up", group: "A", role: "main" },
    { id: "row", gym: "Chest-supported dumbbell row", bodyweight: "Inverted row", group: "A", role: "main" },
    { id: "chestfly", gym: "Cable chest fly", bodyweight: "Wide-grip push-up", group: "B", role: "accessory" },
    { id: "pulldown", gym: "Lat pulldown", bodyweight: "Prone lat pull-down", group: "B", role: "accessory" },
  ],
  shoulders_arms: [
    { id: "shoulderpress", gym: "Seated dumbbell shoulder press", bodyweight: "Pike push-up", group: "A", role: "main" },
    { id: "lateralraise", gym: "Dumbbell lateral raise", bodyweight: "Prone Y-T raise", group: "A", role: "accessory" },
    { id: "curl", gym: "Dumbbell biceps curl", bodyweight: "Self-resisted biceps curl", group: "B", role: "accessory", perSide: true },
    { id: "triceps", gym: "Cable triceps extension", bodyweight: "Bodyweight triceps extension", group: "B", role: "accessory" },
  ],
};

/** Power phase adds jumps to lower-body sessions. */
const PLYO: Partial<Record<Focus, Move>> = {
  legs_core: { id: "pogo", gym: "Pogo hops", bodyweight: "Pogo hops", group: "D", role: "plyo", cue: "Quick, springy contacts." },
  full: { id: "squatjump", gym: "Squat jump", bodyweight: "Squat jump", group: "D", role: "plyo", cue: "Land softly and reset." },
  lower: { id: "squatjump", gym: "Squat jump", bodyweight: "Squat jump", group: "D", role: "plyo", cue: "Land softly and reset." },
  legs: { id: "pogo", gym: "Pogo hops", bodyweight: "Pogo hops", group: "D", role: "plyo", cue: "Quick, springy contacts." },
};

interface Prescription {
  sets: number;
  reps: number;
  restSec: number;
  load: Exercise["load"];
  holdSec: number;
}

const BLOCKS: Record<StrengthBlock, { main: Prescription; accessory: Prescription; core: Prescription; duration: [number, number] }> = {
  foundation: {
    main: { sets: 3, reps: 12, restSec: 60, load: "light", holdSec: 30 },
    accessory: { sets: 2, reps: 12, restSec: 60, load: "light", holdSec: 30 },
    core: { sets: 2, reps: 10, restSec: 45, load: "bodyweight", holdSec: 30 },
    duration: [40, 50],
  },
  strength: {
    main: { sets: 3, reps: 8, restSec: 90, load: "moderate", holdSec: 40 },
    accessory: { sets: 3, reps: 10, restSec: 60, load: "moderate", holdSec: 40 },
    core: { sets: 3, reps: 10, restSec: 45, load: "bodyweight", holdSec: 40 },
    duration: [40, 50],
  },
  power: {
    main: { sets: 3, reps: 5, restSec: 120, load: "heavy", holdSec: 45 },
    accessory: { sets: 3, reps: 8, restSec: 60, load: "moderate", holdSec: 45 },
    core: { sets: 3, reps: 10, restSec: 45, load: "bodyweight", holdSec: 45 },
    duration: [40, 50],
  },
  maintenance: {
    main: { sets: 2, reps: 8, restSec: 90, load: "moderate", holdSec: 30 },
    accessory: { sets: 2, reps: 10, restSec: 60, load: "light", holdSec: 30 },
    core: { sets: 2, reps: 10, restSec: 45, load: "bodyweight", holdSec: 30 },
    duration: [25, 35],
  },
};

const LIGHTER: Record<Exercise["load"], Exercise["load"]> = { heavy: "moderate", moderate: "light", light: "light", bodyweight: "bodyweight" };

const DESCRIPTIONS: Record<StrengthBlock, string> = {
  foundation: "Learn the movements with lighter loads and higher reps. Finish every set feeling you had 3–4 reps left.",
  strength: "Build strength with controlled repetitions. Stop each set with about 2 reps left.",
  power: "Use controlled, low-rep sets for the main movements. Take the full rest between sets.",
  maintenance: "Shorter session to keep your strength while running volume drops. Nothing should feel hard.",
};

export function buildStrength(params: {
  id: string;
  date: string;
  focus: Focus;
  phase: Phase;
  equipment: Equipment;
  level: PlanInput["experience"];
}): StrengthWorkout {
  const { focus, phase, equipment, level } = params;
  const block = strengthBlock(phase);
  const rx = BLOCKS[block];
  const lighterWeek = phase === "recovery";

  const moves = [...LIBRARY[focus]];
  const plyo = PLYO[focus];
  if (block === "power" && plyo) moves.push(plyo);

  const exercises: Exercise[] = moves.map((m) => {
    const base = m.role === "plyo" ? { ...rx.accessory, reps: 6, load: "bodyweight" as const } : rx[m.role];
    let sets = base.sets - (lighterWeek ? 1 : 0) - (level === "beginner" && m.role !== "main" ? 1 : 0);
    sets = Math.max(2, sets);
    const load = equipment === "bodyweight" ? "bodyweight" : lighterWeek ? LIGHTER[base.load] : base.load;
    return {
      id: m.id,
      name: equipment === "gym" ? m.gym : m.bodyweight,
      group: m.group,
      sets,
      ...(m.timed ? { durationSec: base.holdSec } : { reps: base.reps }),
      perSide: m.perSide ?? false,
      restSec: base.restSec,
      load,
      ...(m.cue ? { cue: m.cue } : {}),
    };
  });

  return {
    id: params.id,
    date: params.date,
    kind: "strength",
    type: "strength",
    focus,
    title: STRENGTH_FOCUS_LABELS[focus],
    description: lighterWeek ? `Lighter week: one set fewer and easier loads. ${DESCRIPTIONS[block]}` : DESCRIPTIONS[block],
    durationMin: lighterWeek ? [30, 40] : rx.duration,
    exercises,
  };
}
