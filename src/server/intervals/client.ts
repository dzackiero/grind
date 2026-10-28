import { z } from "zod";

/*
 * Minimal intervals.icu API client.
 * Auth: HTTP Basic, username "API_KEY", password = the athlete's API key.
 * Athlete id "0" means "the owner of this key".
 */

export const INTERVALS_BASE = "https://intervals.icu/api/v1";

export class IntervalsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

// Parse loosely: keep known fields typed, let everything else through to `raw`.
const num = z.number().nullish();

export const IntervalsActivitySchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    start_date_local: z.string(),
    type: z.string().nullish(),
    name: z.string().nullish(),
    distance: num,
    moving_time: num,
    elapsed_time: num,
    average_heartrate: num,
    max_heartrate: num,
    icu_training_load: num,
    total_elevation_gain: num,
    source: z.string().nullish(),
  })
  .loose();
export type IntervalsActivity = z.infer<typeof IntervalsActivitySchema>;

export const IntervalsWellnessSchema = z
  .object({
    id: z.string(), // the date, YYYY-MM-DD
    restingHR: num,
    hrv: num,
    sleepSecs: num,
    sleepScore: num,
    readiness: num,
    weight: num,
    ctl: num,
    atl: num,
  })
  .loose();
export type IntervalsWellness = z.infer<typeof IntervalsWellnessSchema>;

export interface IntervalsAthlete {
  id: string;
  name: string | null;
}

/** Second-by-second time (seconds since start) and cumulative distance (metres) of a run. */
export interface IntervalsStreams {
  time: (number | null)[];
  distance: (number | null)[];
}

export interface IntervalsApi {
  getAthlete(): Promise<IntervalsAthlete>;
  listActivities(oldest: string, newest: string): Promise<IntervalsActivity[]>;
  listWellness(oldest: string, newest: string): Promise<IntervalsWellness[]>;
  /** Null when the activity has no usable time and distance streams (for example it was entered by hand). */
  getActivityStreams(activityId: string): Promise<IntervalsStreams | null>;
}

export function createIntervalsClient(apiKey: string, athleteId = "0", fetchImpl: typeof fetch = fetch): IntervalsApi {
  const auth = "Basic " + Buffer.from(`API_KEY:${apiKey}`).toString("base64");

  async function get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${INTERVALS_BASE}${path}`, {
        headers: { authorization: auth, accept: "application/json", "user-agent": "Kilo/0.1 (+https://github.com)" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch {
      throw new IntervalsError("Couldn't reach intervals.icu. Check your connection and try again.", 0);
    }
    if (res.status === 401 || res.status === 403)
      throw new IntervalsError("intervals.icu rejected the API key. Copy it again from intervals.icu → Settings → Developer Settings.", res.status);
    if (res.status === 404) throw new IntervalsError("intervals.icu couldn't find that athlete. Leave the athlete ID empty to use the key's owner.", 404);
    if (res.status === 429) throw new IntervalsError("intervals.icu is rate limiting requests. Try again in a few minutes.", 429);
    if (!res.ok) throw new IntervalsError(`intervals.icu returned an error (${res.status}). Try again later.`, res.status);
    return (await res.json()) as T;
  }

  const athlete = encodeURIComponent(athleteId || "0");
  return {
    async getAthlete() {
      const a = await get<{ id: string | number; name?: string | null }>(`/athlete/${athlete}`);
      return { id: String(a.id), name: a.name ?? null };
    },
    async listActivities(oldest, newest) {
      const rows = await get<unknown[]>(`/athlete/${athlete}/activities?oldest=${oldest}&newest=${newest}`);
      // Skip rows that don't parse (e.g. Strava stubs without a start date) instead of failing the sync
      return rows.flatMap((r) => {
        const p = IntervalsActivitySchema.safeParse(r);
        return p.success ? [p.data] : [];
      });
    },
    async listWellness(oldest, newest) {
      const rows = await get<unknown[]>(`/athlete/${athlete}/wellness?oldest=${oldest}&newest=${newest}`);
      return rows.flatMap((r) => {
        const p = IntervalsWellnessSchema.safeParse(r);
        return p.success ? [p.data] : [];
      });
    },
    async getActivityStreams(activityId) {
      const streams = await get<{ type?: string; data?: unknown }[]>(`/activity/${encodeURIComponent(activityId)}/streams?types=time,distance`);
      const series = (type: string) => {
        const data = streams.find((s) => s.type === type)?.data;
        return Array.isArray(data) ? (data as unknown[]).map((v) => (typeof v === "number" ? v : null)) : null;
      };
      const time = series("time");
      const distance = series("distance");
      return time && distance && time.length > 1 ? { time, distance } : null;
    },
  };
}
