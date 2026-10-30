import {
  addDays,
  circularDayGap,
  dateForWeekday,
  daysBetween,
  mondayOf,
  WEEKDAYS,
  weekdayOf,
  type Weekday,
} from "./dates";
import {
  expectedGain,
  paceZones,
  predictRaceTime,
  RACE_DISTANCE_M,
  startingFitness,
} from "./paces";
import {
  easyRun,
  finishRun,
  hillRun,
  intervalRun,
  longRun,
  raceDay,
  round05,
  sharpener,
  tempoRun,
  type LongVariant,
} from "./run-sessions";
import {
  PlanInputSchema,
  type PaceZones,
  type Plan,
  type PlanInput,
  type RunWorkout,
  type Week,
  type Workout,
} from "./schema";
import { buildStrength, weeklySplit } from "./strength-sessions";
import {
  GOAL_TEMPLATES,
  INTENSITY,
  INTERVALS,
  LONG_STEP_KM,
  longRunShare,
  PHASE_FOCUS,
  PROGRESSION_CAP,
} from "./templates";

type Phase = Week["phase"];
type Quality = "intervals" | "tempo" | "hills" | "sharpener";

// ---------- Plan shape ----------

/** Phase per week: base → build → peak with a lighter week every 4th week, then taper. */
export function phasesFor(totalWeeks: number, taperWeeks: number): Phase[] {
  const n = totalWeeks - taperWeeks;
  const base = Math.max(1, Math.round(n * 0.3));
  const build = n >= 3 ? Math.max(1, Math.round(n * 0.4)) : 0;
  const phases: Phase[] = [];
  for (let i = 1; i <= n; i++) {
    let phase: Phase = i <= base ? "base" : i <= base + build ? "build" : "peak";
    if (i % 4 === 0 && i < n) phase = "recovery";
    phases.push(phase);
  }
  for (let i = 0; i < taperWeeks; i++) phases.push("taper");
  return phases;
}

/** Planned km per week before it is split into sessions. */
export function weeklyVolumes(input: PlanInput, phases: Phase[]): number[] {
  const tpl = GOAL_TEMPLATES[input.goal];
  const { peakFactor, weeklyGrowth, minStepKm } = INTENSITY[input.intensity];
  const peak = Math.max(input.currentWeeklyKm, tpl.peakKm[input.experience] * peakFactor);
  const start = Math.min(Math.max(input.currentWeeklyKm, tpl.floorKm), peak);
  const taperStart = phases.indexOf("taper");

  let lastLoad = start;
  return phases.map((phase, i) => {
    if (i === 0) return start;
    if (phase === "recovery") return lastLoad * 0.75;
    if (phase === "taper") {
      const factors = tpl.taperFactors.slice(-(phases.length - taperStart));
      return lastLoad * factors[i - taperStart];
    }
    const step = Math.min(Math.max(lastLoad * weeklyGrowth, minStepKm), lastLoad * 0.15);
    lastLoad = Math.min(peak, lastLoad + step);
    return lastLoad;
  });
}

function qualityCount(input: PlanInput, phase: Phase, runDays: number, raceWeek: boolean): number {
  if (raceWeek) return runDays >= 4 ? 1 : 0;
  if (phase === "recovery" || phase === "taper") return 1;
  if (runDays <= 3) return 1;
  if (input.experience === "beginner" && phase === "base") return 1;
  if (runDays === 4) return input.intensity === "push" || input.experience === "advanced" ? 2 : 1;
  return 2;
}

function qualityTypes(
  goal: PlanInput["goal"],
  phase: Phase,
  slots: number,
  weekIndex: number,
): Quality[] {
  if (slots === 0) return [];
  if (phase === "taper") return ["sharpener"];
  if (phase === "recovery") return ["tempo"];
  const speedFirst = goal === "5k" || goal === "10k";
  let pair: Quality[];
  if (phase === "base") pair = ["hills", "tempo"];
  else if (phase === "build")
    pair = weekIndex % 2 === 0 ? ["intervals", "tempo"] : ["tempo", "intervals"];
  else pair = speedFirst ? ["intervals", "tempo"] : ["tempo", "intervals"];
  return pair.slice(0, slots);
}

function longVariant(input: PlanInput, phase: Phase, weekIndex: number): LongVariant {
  if (phase === "recovery" || phase === "taper" || phase === "base") return "easy";
  const alt = weekIndex % 2 === 0;
  if (phase === "build") return input.experience === "beginner" || alt ? "easy" : "progressive";
  if (input.goal === "marathon") return alt ? "marathon_pace" : "easy";
  if (input.goal === "half") return alt ? "race_finish" : "progressive";
  return "progressive";
}

/**
 * Pick days for hard sessions so no two hard days touch (long run counts as hard).
 * Days that can't keep a one-day gap are left as easy runs.
 */
export function pickQualityDays(
  candidates: Weekday[],
  anchors: Weekday[],
  count: number,
): Weekday[] {
  const chosen: Weekday[] = [];
  const pool = [...candidates];
  while (chosen.length < count && pool.length) {
    let best: Weekday | null = null;
    let bestScore = -1;
    for (const d of pool) {
      const others = [...anchors, ...chosen];
      const gap = others.length ? Math.min(...others.map((o) => circularDayGap(d, o))) : 7;
      if (gap < 2) continue;
      // Prefer bigger gaps, then mid-week days
      const score = gap * 10 - Math.abs(WEEKDAYS.indexOf(d) - 2);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (!best) break;
    chosen.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return chosen;
}

/** Assign strength focuses to days so heavy leg work avoids the day before a hard run. */
function assignStrength(
  focuses: ReturnType<typeof weeklySplit>,
  days: Weekday[],
  hardDays: Weekday[],
  longDay: Weekday | null,
) {
  const perms = permutations(days).map((p) => p.slice(0, focuses.length));
  let best = perms[0] ?? [];
  let bestScore = Infinity;
  for (const p of perms) {
    let score = 0;
    p.forEach((day, i) => {
      const f = focuses[i];
      if (f === "upper") return;
      const next = WEEKDAYS[(WEEKDAYS.indexOf(day) + 1) % 7];
      const prev = WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7];
      if (hardDays.includes(next)) score += f === "legs_core" ? 3 : 2;
      if (day === longDay) score += 2;
      if (prev === longDay) score += 1;
    });
    // With 4–5 sessions there are two leg days: keep them apart
    const legDays = p.filter((_, i) => focuses[i] !== "upper");
    for (let a = 0; a < legDays.length; a++)
      for (let b = a + 1; b < legDays.length; b++)
        if (circularDayGap(legDays[a], legDays[b]) === 1) score += 2;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return focuses.map((focus, i) => ({ focus, day: best[i] }));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}

// ---------- Main ----------

export function generatePlan(rawInput: PlanInput): Plan {
  const input = PlanInputSchema.parse(rawInput);
  const tpl = GOAL_TEMPLATES[input.goal];
  const goalDistance = RACE_DISTANCE_M[input.goal];

  // Plan length and dates
  let firstMonday = mondayOf(input.startDate);
  let raceDate: string;
  let totalWeeks: number;
  if (input.raceDate) {
    raceDate = input.raceDate;
    totalWeeks = Math.floor(daysBetween(firstMonday, mondayOf(raceDate)) / 7) + 1;
    if (totalWeeks > tpl.maxWeeks) {
      totalWeeks = tpl.maxWeeks;
      firstMonday = addDays(mondayOf(raceDate), -(totalWeeks - 1) * 7);
    }
  } else {
    totalWeeks = tpl.defaultWeeks;
    raceDate = dateForWeekday(addDays(firstMonday, (totalWeeks - 1) * 7), input.longRunDay);
  }
  const effectiveStart = input.startDate > firstMonday ? input.startDate : firstMonday;

  const taperWeeks = Math.min(tpl.taperFactors.length, Math.max(1, totalWeeks - 2));
  const phases = phasesFor(totalWeeks, taperWeeks);
  const volumes = weeklyVolumes(input, phases);

  // Fitness and paces
  const fitness = startingFitness(input);
  const [gainLow, gainHigh] = expectedGain(totalWeeks, input.experience);
  const paces: PaceZones = paceZones(fitness, goalDistance);
  const estimatedRaceTimeSec = {
    low: predictRaceTime(fitness + gainHigh, goalDistance),
    high: predictRaceTime(fitness + gainLow, goalDistance),
  };

  const runDays = [...input.runDays].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  const strengthDays = [...input.strength.days]
    .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
    .slice(0, input.strength.sessionsPerWeek);
  const counters = { intervals: 0, tempo: 0, hills: 0 };
  const cap = PROGRESSION_CAP[input.experience];

  // Long runs follow their own progression toward the goal's longest run
  const share = longRunShare(runDays.length);
  const maxLong = tpl.maxLongKm[input.experience];
  const longStep = Math.min(
    3,
    Math.max(
      0.5,
      (LONG_STEP_KM[input.experience] + INTENSITY[input.intensity].longStepKm) * tpl.longStepFactor,
    ),
  );
  const taperStart = phases.indexOf("taper");
  let lastLong = round05(Math.min(maxLong, Math.max(tpl.minLongKm, volumes[0] * share)));

  const weeks: Week[] = phases.map((phase, wi) => {
    const weekIndex = wi + 1;
    const weekStart = addDays(firstMonday, wi * 7);
    const raceWeek = weekIndex === totalWeeks;
    const inPlan = (date: string) => date >= effectiveStart && date <= raceDate;

    const available = runDays.filter((d) => {
      const date = dateForWeekday(weekStart, d);
      return inPlan(date) && (!raceWeek || date < raceDate);
    });
    // Partial first week: scale km by the share of run days left
    const nominalKm = volumes[wi] * (available.length / runDays.length);
    const workouts: Workout[] = [];
    const id = (date: string, tag: string) => `w${weekIndex}-${date}-${tag}`;
    const addRun = (draft: Parameters<typeof finishRun>[0], day: Weekday, tag: string) => {
      const date = dateForWeekday(weekStart, day);
      workouts.push(finishRun(draft, id(date, tag), date, paces));
    };

    // Long run (or race)
    let longDay: Weekday | null = null;
    let longKm = 0;
    if (raceWeek) {
      workouts.push(
        finishRun(raceDay(tpl.label, goalDistance, paces), id(raceDate, "race"), raceDate, paces),
      );
    } else if (available.includes(input.longRunDay)) {
      longDay = input.longRunDay;
      if (phase === "recovery") longKm = lastLong * 0.75;
      else if (phase === "taper")
        longKm = lastLong * tpl.taperFactors.slice(-(phases.length - taperStart))[wi - taperStart];
      else {
        if (wi > 0) lastLong = Math.min(maxLong, lastLong + longStep);
        longKm = lastLong;
      }
      // Keep the long run from swallowing the week
      const maxShare = runDays.length <= 3 ? tpl.maxLongShare + 0.02 : tpl.maxLongShare;
      longKm = round05(Math.max(tpl.minLongKm, Math.min(longKm, nominalKm * maxShare)));
      addRun(longRun(longKm, longVariant(input, phase, weekIndex), paces), longDay, "long");
    }

    // Hard sessions
    const raceDay_ = raceWeek ? weekdayOf(raceDate) : null;
    const anchors = [longDay, raceDay_].filter((d): d is Weekday => d !== null);
    let candidates = available.filter((d) => d !== longDay);
    if (raceWeek)
      candidates = candidates.filter(
        (d) => daysBetween(dateForWeekday(weekStart, d), raceDate) >= 3,
      );
    const wanted = qualityTypes(
      input.goal,
      phase,
      qualityCount(input, phase, runDays.length, raceWeek),
      weekIndex,
    );
    const qDays = pickQualityDays(candidates, anchors, wanted.length);

    let qualityKm = 0;
    qDays.forEach((day, i) => {
      const q = wanted[i];
      const easier = phase === "recovery";
      const pick = (key: keyof typeof counters) => {
        const idx = Math.min(cap, easier ? Math.max(0, counters[key] - 2) : counters[key]);
        if (!easier) counters[key]++;
        return idx;
      };
      let draft;
      if (q === "intervals") {
        const list = INTERVALS[input.goal];
        draft = intervalRun(
          list[Math.min(pick("intervals"), list.length - 1)],
          input.experience,
          paces,
        );
      } else if (q === "tempo") draft = tempoRun(pick("tempo"), input.experience, paces);
      else if (q === "hills") draft = hillRun(pick("hills"), input.experience, paces);
      else draft = sharpener(input.goal, raceWeek, input.experience, paces);
      addRun(draft, day, q);
      qualityKm += (workouts[workouts.length - 1] as RunWorkout).distanceKm;
    });

    // Easy runs fill the rest
    const easyDays = available.filter((d) => d !== longDay && !qDays.includes(d));
    if (easyDays.length) {
      const per = Math.max(3, round05((nominalKm - longKm - qualityKm) / easyDays.length));
      const capped = raceWeek ? Math.min(per, 6) : longKm ? Math.min(per, longKm) : per;
      easyDays.forEach((day) => addRun(easyRun(capped, paces), day, "easy"));
    }

    // Strength
    if (strengthDays.length) {
      const hardDays = [...anchors, ...qDays];
      let focuses = weeklySplit(strengthDays.length);
      let days = strengthDays.filter((d) => inPlan(dateForWeekday(weekStart, d)));
      if (raceWeek) {
        // Race week: upper body only, and nothing in the last 3 days
        days = days.filter((d) => daysBetween(dateForWeekday(weekStart, d), raceDate) > 3);
        focuses = focuses.filter((f) => f === "upper").slice(0, Math.min(1, days.length));
      }
      focuses = focuses.slice(0, days.length);
      for (const { focus, day } of assignStrength(focuses, days, hardDays, longDay)) {
        const date = dateForWeekday(weekStart, day);
        workouts.push(
          buildStrength({
            id: id(date, `str-${focus}`),
            date,
            focus,
            phase,
            equipment: input.strength.equipment,
            level: input.experience,
          }),
        );
      }
    }

    workouts.sort((a, b) =>
      a.date === b.date ? (a.kind === "run" ? -1 : 1) : a.date < b.date ? -1 : 1,
    );
    const targetKm = round05(
      workouts.reduce((s, w) => s + (w.kind === "run" ? w.distanceKm : 0), 0),
    );

    return {
      index: weekIndex,
      startDate: weekStart,
      phase,
      targetKm,
      focus: raceWeek ? "Race week. Short, sharp and rested, then race." : PHASE_FOCUS[phase],
      workouts,
    };
  });

  return {
    version: 1,
    goal: input.goal,
    title: `${tpl.label} Plan`,
    raceDate,
    startDate: effectiveStart,
    fitnessScore: Math.round(fitness * 10) / 10,
    paces,
    estimatedRaceTimeSec,
    input,
    source: "template",
    weeks,
  };
}
