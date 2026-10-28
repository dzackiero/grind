import { MAX_STEP_SPEED } from "./efforts";

/*
 * Everything the activity page shows that comes from an activity's streams: splits, pace and
 * grade-adjusted pace, elevation and the route. Pure functions over the streams intervals.icu returns.
 */

/** One value per sample, null where the watch recorded nothing. */
type Series = readonly (number | null)[];

export interface DetailStreams {
  /** Seconds since the start */
  time: Series;
  /** Cumulative metres */
  distance: Series;
  /** [latitude, longitude] per sample; null for treadmill and manual runs */
  latlng: readonly (readonly [number, number] | null)[] | null;
  /** Metres above sea level (the corrected altitude when intervals.icu has one) */
  altitude: Series | null;
  heartrate: Series | null;
  /** Strides per minute, as intervals.icu stores running cadence (one foot) */
  cadence: Series | null;
  /** Slope in percent */
  grade: Series | null;
}

interface Sample {
  /** Index into the original streams */
  i: number;
  t: number;
  d: number;
}

/**
 * Samples with both values, time moving forward and distance only growing at a human speed:
 * a GPS jump can remove a few metres, never add 100 m in a second. Same cleaning as best efforts.
 */
function clean(time: Series, distance: Series): Sample[] {
  const out: Sample[] = [];
  let prev: { t: number; raw: number } | null = null;
  let cumulative = 0;
  const n = Math.min(time.length, distance.length);
  for (let i = 0; i < n; i++) {
    const t = time[i];
    const raw = distance[i];
    if (t == null || raw == null || !Number.isFinite(t) || !Number.isFinite(raw)) continue;
    if (prev === null) {
      out.push({ i, t, d: 0 });
    } else {
      const dt = t - prev.t;
      if (dt <= 0) continue;
      cumulative += Math.min(Math.max(0, raw - prev.raw), MAX_STEP_SPEED * dt);
      out.push({ i, t, d: cumulative });
    }
    prev = { t, raw };
  }
  return out;
}

/** Time (seconds since start) at which the athlete reached `meters`, between two samples. */
function timeAt(samples: Sample[], meters: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d < meters) lo = mid + 1;
    else hi = mid;
  }
  const b = samples[lo];
  const a = samples[Math.max(0, lo - 1)];
  const span = b.d - a.d;
  return span > 0 ? a.t + ((meters - a.d) / span) * (b.t - a.t) : b.t;
}

export interface Split {
  /** 1, 2, 3 … */
  km: number;
  /** Length of this split in km: 1, or less for the last one */
  distanceKm: number;
  /** Seconds per km over this split */
  paceSec: number;
  /** Seconds faster (positive) or slower (negative) than the split before; null for the first */
  gainSec: number | null;
}

/** One split per full kilometre, plus the remainder when it is at least 100 m. */
export function computeSplits(streams: Pick<DetailStreams, "time" | "distance">): Split[] {
  const samples = clean(streams.time, streams.distance);
  if (samples.length < 2) return [];
  const total = samples[samples.length - 1].d;
  const out: Split[] = [];
  let startM = 0;
  let startT = samples[0].t;
  while (startM < total) {
    const endM = Math.min(startM + 1000, total);
    if (endM - startM < 100 && out.length > 0) break;
    const endT = endM === total ? samples[samples.length - 1].t : timeAt(samples, endM);
    const distanceKm = (endM - startM) / 1000;
    const paceSec = (endT - startT) / distanceKm;
    const previous = out.at(-1);
    out.push({ km: out.length + 1, distanceKm, paceSec, gainSec: previous ? previous.paceSec - paceSec : null });
    startM = endM;
    startT = endT;
  }
  return out;
}

/**
 * How much harder a slope is than flat ground, as a multiplier on effort. Uphill follows Minetti's 2002 cost
 * of running, which Strava still uses for climbs. Downhill follows Strava's heart-rate-based model: the best
 * slope is about -9% (running 12% easier), and by -18% it is no easier than flat. Strava published the model as a
 * chart, so the downhill curve here is fitted to those three points and is an approximation.
 */
export function gradeFactor(gradePercent: number): number {
  const g = Math.max(-0.45, Math.min(0.45, gradePercent / 100));
  if (g >= 0) {
    const cost = 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
    return cost / 3.6;
  }
  if (g >= -0.18) return 1 - 0.12 * (1 - ((g + 0.09) / 0.09) ** 2);
  return 1 + (-0.18 - g) * 1.5;
}

export interface PacePoint {
  /** Distance in km */
  km: number;
  /** Seconds per km */
  pace: number;
  /** Grade-adjusted seconds per km; equals `pace` without elevation data */
  gap: number;
}

export interface PaceAnalysis {
  series: PacePoint[];
  avgPaceSec: number | null;
  avgGapSec: number | null;
  /** Fastest smoothed stretch, seconds per km */
  maxPaceSec: number | null;
  hasGrade: boolean;
}

const BIN_M = 25;
const SMOOTH = 2;
const SLOWEST = 20 * 60;
const FASTEST = 2 * 60;

/** Pace along the run in 25 m steps, lightly smoothed, with the grade-adjusted pace for the same steps. */
export function analysePace(streams: Pick<DetailStreams, "time" | "distance" | "altitude" | "grade">): PaceAnalysis {
  const samples = clean(streams.time, streams.distance);
  if (samples.length < 2) return { series: [], avgPaceSec: null, avgGapSec: null, maxPaceSec: null, hasGrade: false };
  const total = samples[samples.length - 1].d;
  const hasGrade = !!streams.grade || !!streams.altitude;

  // Slope for each 25 m step: the stream's own value when it has one, else from the altitude change
  const gradeAt = (fromM: number, toM: number) => {
    if (streams.grade) {
      const inside = samples.filter((s) => s.d >= fromM && s.d <= toM).map((s) => streams.grade![s.i]).filter((v): v is number => v != null);
      if (inside.length) return inside.reduce((a, b) => a + b, 0) / inside.length;
    }
    if (streams.altitude) {
      const near = (m: number) => {
        const index = samples.findIndex((s) => s.d >= m);
        return samples[index < 0 ? samples.length - 1 : index];
      };
      const a = near(Math.max(0, fromM - 25));
      const b = near(Math.min(total, toM + 25));
      const alt = (s: Sample) => streams.altitude![s.i];
      const rise = alt(b) != null && alt(a) != null ? alt(b)! - alt(a)! : null;
      if (rise != null && b.d - a.d > 20) return (rise / (b.d - a.d)) * 100;
    }
    return 0;
  };

  const raw: { km: number; seconds: number; meters: number; flatMeters: number }[] = [];
  for (let from = 0; from < total; from += BIN_M) {
    const to = Math.min(from + BIN_M, total);
    const meters = to - from;
    if (meters < 5) continue;
    const seconds = timeAt(samples, to) - timeAt(samples, from);
    raw.push({ km: (from + meters / 2) / 1000, seconds, meters, flatMeters: meters * gradeFactor(gradeAt(from, to)) });
  }

  const clamp = (v: number) => Math.min(SLOWEST, Math.max(FASTEST, v));
  const series: PacePoint[] = raw.map((_, i) => {
    const window = raw.slice(Math.max(0, i - SMOOTH), i + SMOOTH + 1);
    const seconds = window.reduce((a, b) => a + b.seconds, 0);
    const meters = window.reduce((a, b) => a + b.meters, 0);
    const flat = window.reduce((a, b) => a + b.flatMeters, 0);
    return { km: Math.round(raw[i].km * 1000) / 1000, pace: clamp((seconds / meters) * 1000), gap: clamp((seconds / flat) * 1000) };
  });

  const duration = samples[samples.length - 1].t - samples[0].t;
  const flatTotal = raw.reduce((a, b) => a + b.flatMeters, 0);
  return {
    series,
    avgPaceSec: total > 0 ? (duration / total) * 1000 : null,
    avgGapSec: flatTotal > 0 ? (duration / flatTotal) * 1000 : null,
    maxPaceSec: series.length ? Math.min(...series.map((p) => p.pace)) : null,
    hasGrade,
  };
}

export interface ElevationAnalysis {
  series: { km: number; m: number }[];
  maxM: number | null;
}

/** Altitude along the run, about one point per 25 m. */
export function analyseElevation(streams: Pick<DetailStreams, "time" | "distance" | "altitude">): ElevationAnalysis {
  if (!streams.altitude) return { series: [], maxM: null };
  const samples = clean(streams.time, streams.distance);
  const series: { km: number; m: number }[] = [];
  let next = 0;
  for (const s of samples) {
    const alt = streams.altitude[s.i];
    if (alt == null || !Number.isFinite(alt) || s.d < next) continue;
    series.push({ km: Math.round(s.d) / 1000, m: Math.round(alt * 10) / 10 });
    next = s.d + BIN_M;
  }
  return { series, maxM: series.length ? Math.max(...series.map((p) => p.m)) : null };
}

export interface Route {
  /** SVG path in a 0–100 box, aspect ratio kept */
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Width / height of the box the route fills */
  aspect: number;
}

/** The route drawn flat: longitude is scaled by the cosine of the latitude so it keeps its shape. */
export function buildRoute(latlng: DetailStreams["latlng"], maxPoints = 400): Route | null {
  const points = (latlng ?? []).filter((p): p is readonly [number, number] => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && !(p[0] === 0 && p[1] === 0));
  if (points.length < 2) return null;
  const step = Math.max(1, Math.ceil(points.length / maxPoints));
  const kept = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const lat0 = kept.reduce((a, p) => a + p[0], 0) / kept.length;
  const scale = Math.cos((lat0 * Math.PI) / 180);
  const xy = kept.map(([lat, lng]) => ({ x: lng * scale, y: -lat }));
  const minX = Math.min(...xy.map((p) => p.x));
  const maxX = Math.max(...xy.map((p) => p.x));
  const minY = Math.min(...xy.map((p) => p.y));
  const maxY = Math.max(...xy.map((p) => p.y));
  const size = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const norm = xy.map((p) => ({ x: Math.round(((p.x - minX) / size) * 1000) / 10, y: Math.round(((p.y - minY) / size) * 1000) / 10 }));
  const width = ((maxX - minX) / size) * 100;
  const height = ((maxY - minY) / size) * 100;
  return {
    path: norm.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "),
    start: norm[0],
    end: norm[norm.length - 1],
    aspect: height > 0 ? Math.max(0.5, Math.min(2, width / height)) : 2,
  };
}

const GENERIC_TITLES: Record<string, string> = { Run: "Outdoor run", TrailRun: "Trail run", VirtualRun: "Indoor run", Treadmill: "Indoor run" };

/** An unnamed watch recording reads "Outdoor run" / "Indoor run" instead of the raw activity type. */
export function activityTitle(type: string, name: string | null | undefined): string {
  const label = name?.trim();
  return label && label !== type ? label : (GENERIC_TITLES[type] ?? type);
}

/** Cadence in steps per minute; intervals.icu stores running cadence as strides (one foot) per minute. */
export function stepsPerMinute(avgCadence: number | null | undefined): number | null {
  return avgCadence != null && avgCadence > 0 ? Math.round(avgCadence * 2) : null;
}
