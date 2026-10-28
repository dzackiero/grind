/*
 * Best efforts: the fastest time an athlete has covered a standard distance, found inside one run's
 * time and distance stream (a sliding window), not from the whole run.
 *
 * GPS streams contain glitches: a single point that jumps 100+ m in a second would make any window that
 * contains it look absurdly fast. Every step is capped at a human speed before windows are measured, so a
 * glitch can only remove a few metres, never create a record.
 */

export const EFFORT_DISTANCES = [
  { key: "1k", label: "1K", meters: 1000, plate: "white" },
  { key: "1mi", label: "1MI", meters: 1609.344, plate: "white" },
  { key: "2mi", label: "2MI", meters: 3218.688, plate: "white" },
  { key: "5k", label: "5K", meters: 5000, plate: "green" },
  { key: "5mi", label: "5MI", meters: 8046.72, plate: "green" },
  { key: "10k", label: "10K", meters: 10000, plate: "yellow" },
  { key: "half", label: "21.1", meters: 21097.5, plate: "blue" },
  { key: "marathon", label: "42.2", meters: 42195, plate: "red" },
] as const;

export type EffortKey = (typeof EFFORT_DISTANCES)[number]["key"];
export type PlateColor = (typeof EFFORT_DISTANCES)[number]["plate"];

/** Faster than this between two samples is a GPS jump: 8 m/s is 2:05 per km. */
export const MAX_STEP_SPEED = 8;
/** No window of 400 m or more averages faster than this (7.5 m/s is 2:13 per km, quicker than any recreational runner). */
export const MAX_WINDOW_SPEED = 7.5;

/** Run types whose distance comes from GPS. Treadmill distances depend on calibration, so they don't count. */
export const RECORD_ACTIVITY_TYPES = new Set(["Run", "TrailRun"]);

/**
 * Best time in seconds for every distance the run is long enough for.
 * `time` is seconds since the start, `distance` is cumulative metres; both one value per sample.
 */
export function bestEfforts(time: readonly (number | null)[], distance: readonly (number | null)[]): Partial<Record<EffortKey, number>> {
  const n = Math.min(time.length, distance.length);

  // Clean: keep samples where both values exist and time moves forward, and cap each step's speed.
  // The first sample's own distance (a watch often starts a few metres in) is ignored: only steps count.
  const t: number[] = [];
  const d: number[] = [];
  let prevTime: number | null = null;
  let prevRaw = 0;
  let cumulative = 0;
  for (let i = 0; i < n; i++) {
    const ti = time[i];
    const di = distance[i];
    if (ti == null || di == null || !Number.isFinite(ti) || !Number.isFinite(di)) continue;
    if (prevTime === null) {
      t.push(ti);
      d.push(0);
    } else {
      const dt = ti - prevTime;
      if (dt <= 0) continue;
      cumulative += Math.min(Math.max(0, di - prevRaw), MAX_STEP_SPEED * dt);
      t.push(ti);
      d.push(cumulative);
    }
    prevTime = ti;
    prevRaw = di;
  }
  const out: Partial<Record<EffortKey, number>> = {};
  if (t.length < 2) return out;
  const total = d[d.length - 1];

  for (const { key, meters } of EFFORT_DISTANCES) {
    if (total < meters) continue;
    let best = Infinity;
    let j = 1;
    for (let i = 0; i < t.length - 1; i++) {
      if (j <= i) j = i + 1;
      while (j < t.length && d[j] - d[i] < meters) j++;
      if (j >= t.length) break;
      // Time at which the athlete reaches d[i] + meters, between samples j-1 and j
      const span = d[j] - d[j - 1];
      const frac = span > 0 ? (d[i] + meters - d[j - 1]) / span : 1;
      const seconds = t[j - 1] + frac * (t[j] - t[j - 1]) - t[i];
      if (seconds > 0 && seconds < best && meters / seconds <= MAX_WINDOW_SPEED) best = seconds;
    }
    if (Number.isFinite(best)) out[key] = Math.round(best * 10) / 10;
  }
  return out;
}

/** "5:00", "27:41", "1:58:30" from seconds. */
export function formatEffort(seconds: number) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
