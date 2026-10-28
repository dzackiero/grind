import { sql } from "drizzle-orm";
import { date, foreignKey, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PaceZones, Plan, PlanInput, Workout } from "@/lib/plan";
import { user } from "./auth";

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Per-user settings, including the intervals.icu connection. The API key is stored encrypted. */
export const athleteProfile = pgTable("athlete_profile", {
  userId: userId().primaryKey(),
  intervalsAthleteId: text("intervals_athlete_id"),
  intervalsApiKeyEnc: text("intervals_api_key_enc"),
  /** Athlete name from intervals.icu, shown in Settings to confirm the right account */
  intervalsAthleteName: text("intervals_athlete_name"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  /** Last sync error, shown in Settings until the next successful sync */
  lastSyncError: text("last_sync_error"),
  timezone: text("timezone").notNull().default("UTC"),
  ...timestamps,
});

/** Activities synced from intervals.icu (runs, strength, anything the watch recorded). */
export const activity = pgTable(
  "activity",
  {
    userId: userId(),
    /** intervals.icu activity id, e.g. "i12345678" */
    id: text("id").notNull(),
    /** Local date of the start, YYYY-MM-DD */
    date: date("date", { mode: "string" }).notNull(),
    startLocal: text("start_local").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    distanceM: real("distance_m"),
    movingTimeSec: integer("moving_time_sec"),
    elapsedTimeSec: integer("elapsed_time_sec"),
    avgHr: real("avg_hr"),
    maxHr: real("max_hr"),
    trainingLoad: real("training_load"),
    elevationGainM: real("elevation_gain_m"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    /** When best efforts were calculated from this run's stream; null until then */
    effortsAt: timestamp("efforts_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("activity_user_date").on(t.userId, t.date)],
);

/** Fastest time over a standard distance inside one run (see lib/efforts.ts). Personal records are the best per key. */
export const activityEffort = pgTable(
  "activity_effort",
  {
    userId: userId(),
    activityId: text("activity_id").notNull(),
    /** "1k", "1mi", "5k"… */
    key: text("key").notNull(),
    seconds: real("seconds").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.activityId, t.key] }),
    foreignKey({ columns: [t.userId, t.activityId], foreignColumns: [activity.userId, activity.id] }).onDelete("cascade"),
    index("activity_effort_best").on(t.userId, t.key, t.seconds),
  ],
);

/** Daily wellness from intervals.icu (Huawei Health sends HRV, resting HR, sleep). */
export const wellness = pgTable(
  "wellness",
  {
    userId: userId(),
    date: date("date", { mode: "string" }).notNull(),
    restingHr: real("resting_hr"),
    hrv: real("hrv"),
    sleepSecs: integer("sleep_secs"),
    sleepScore: real("sleep_score"),
    readiness: real("readiness"),
    weightKg: real("weight_kg"),
    /** Fitness (CTL) and fatigue (ATL) as intervals.icu computes them */
    ctl: real("ctl"),
    atl: real("atl"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/** One training plan. Each user has at most one active plan; older ones are archived. */
export const plan = pgTable(
  "plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    goal: text("goal", { enum: ["5k", "10k", "half", "marathon"] }).notNull(),
    title: text("title").notNull(),
    raceDate: date("race_date", { mode: "string" }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    fitnessScore: real("fitness_score").notNull(),
    source: text("source", { enum: ["template", "coach"] }).notNull(),
    input: jsonb("input").$type<PlanInput>().notNull(),
    paces: jsonb("paces").$type<PaceZones>().notNull(),
    estimatedRaceTimeSec: jsonb("estimated_race_time_sec").$type<Plan["estimatedRaceTimeSec"]>().notNull(),
    /** Bumped on every saved change, so concurrent edits (app vs Claude) can be detected */
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("plan_one_active_per_user").on(t.userId).where(sql`${t.status} = 'active'`)],
);

export const planWeek = pgTable(
  "plan_week",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    phase: text("phase", { enum: ["base", "build", "peak", "taper", "recovery"] }).notNull(),
    targetKm: real("target_km").notNull(),
    focus: text("focus").notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.index] })],
);

/**
 * One workout row per planned session, so Today and Calendar can query by date.
 * `data` holds the full validated workout (steps or exercises); the columns beside it are copies for querying.
 */
export const plannedWorkout = pgTable(
  "planned_workout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    userId: userId(),
    /** The engine's workout id, e.g. "w3-2026-11-11-intervals" */
    workoutKey: text("workout_key").notNull(),
    weekIndex: integer("week_index").notNull(),
    position: integer("position").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    kind: text("kind", { enum: ["run", "strength"] }).notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    distanceKm: real("distance_km"),
    data: jsonb("data").$type<Workout>().notNull(),
    status: text("status", { enum: ["planned", "completed", "skipped"] }).notNull().default("planned"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** intervals.icu activity matched to this workout */
    activityId: text("activity_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("planned_workout_plan_key").on(t.planId, t.workoutKey), index("planned_workout_user_date").on(t.userId, t.date)],
);

/** A change to a plan, proposed by the coach (Claude via MCP) or made by the user. Shown as a PlanChange card. */
export const planChange = pgTable(
  "plan_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    userId: userId(),
    source: text("source", { enum: ["coach", "user"] }).notNull(),
    summary: text("summary").notNull(),
    /** Before/after for each touched workout */
    changes: jsonb("changes").$type<{ workoutKey: string; before: Workout | null; after: Workout | null }[]>().notNull(),
    status: text("status", { enum: ["proposed", "accepted", "rejected"] }).notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("plan_change_plan").on(t.planId, t.createdAt)],
);
