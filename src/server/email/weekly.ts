import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import { addDays, mondayOf, weekdayOf } from "@/lib/plan/dates";
import type { DB } from "../db/client";
import { athleteProfile, emailDelivery, emailPreference, plan, plannedWorkout, planWeek, user } from "../db/schema";
import { listHabits } from "../habits/service";
import { listWorkouts } from "../plans/service";
import { getTrainingSummary } from "../progress/coaching-summary";
import { todayIn } from "../profile/service";
import { enqueueEmail } from "./outbox";
import { emailTemplate } from "./templates";
import { unsubscribeToken, type WeeklyKind } from "./unsubscribe";

/** Runs after the scheduled local time, once per local week. IANA zones handle DST and fractional offsets. */
export function weeklyWindow(timezone: string, now: Date): { kind: WeeklyKind; from: string; to: string } | null {
  let today: string, hour: number;
  try {
    today = todayIn(timezone, now);
    hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(now));
  } catch { return null; }
  const day = weekdayOf(today);
  if (day === "mon" && hour >= 7) {
    const from = addDays(mondayOf(today), -7);
    return { kind: "weekly-recap", from, to: addDays(from, 6) };
  }
  if (day === "sun" && hour >= 17) {
    const from = addDays(mondayOf(today), 7);
    return { kind: "weekly-preview", from, to: addDays(from, 6) };
  }
  return null;
}

async function recapParagraphs(db: DB, userId: string, from: string, to: string) {
  const [summary, completed, habits] = await Promise.all([
    getTrainingSummary(db, userId, to, 7),
    db.select({ kind: plannedWorkout.kind }).from(plannedWorkout).where(and(eq(plannedWorkout.userId, userId),
      gte(plannedWorkout.date, from), lte(plannedWorkout.date, to), eq(plannedWorkout.status, "completed"))),
    listHabits(db, userId, { from, to }),
  ]);
  const recorded = summary.period;
  const strengthDone = completed.filter((w) => w.kind === "strength").length;
  const habitLines = habits.map((h) => {
    let scheduled = 0, done = 0;
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (date >= h.createdOn && h.days.includes(weekdayOf(date))) {
        scheduled++;
        if (h.doneDates.includes(date)) done++;
      }
    }
    return `${h.name}: ${done}/${scheduled} scheduled days`;
  });
  return [
    `Your training from ${from} to ${to}.`,
    `Recorded running: ${recorded.km === null ? "distance unavailable" : `${Number(recorded.km.toFixed(1))} km`} across ${recorded.runSessions} sessions.\nCompleted plan workouts: ${completed.length}.\nStrength: ${strengthDone} plan sessions completed; ${recorded.strengthSessions} sessions recorded by your watch.`,
    ...(recorded.runsWithDistance < recorded.runSessions ? ["Some recorded runs have no distance data; the distance above includes known measurements only."] : []),
    ...(habitLines.length ? [`Habits\n${habitLines.join("\n")}`] : ["No habits tracked this week."]),
    "Recorded totals use activities already synced to Grind. Open the app to sync any missing activities.",
  ];
}

export async function queueWeeklyEmails(db: DB, now = new Date(), deadline?: number) {
  const recipients = await db.select({ id: user.id, name: user.name, email: user.email, timezone: athleteProfile.timezone,
    recap: emailPreference.weeklyRecap, preview: emailPreference.weeklyPreview })
    .from(user).innerJoin(emailPreference, eq(emailPreference.userId, user.id))
    .leftJoin(athleteProfile, eq(athleteProfile.userId, user.id))
    .where(and(eq(user.emailVerified, true), or(eq(emailPreference.weeklyRecap, true), eq(emailPreference.weeklyPreview, true)), isNotNull(athleteProfile.timezone)));
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let queued = 0;
  for (const recipient of recipients) {
    if (deadline && Date.now() >= deadline) break;
    const window = weeklyWindow(recipient.timezone!, now);
    if (!window || (window.kind === "weekly-recap" ? !recipient.recap : !recipient.preview)) continue;
    const { kind, from, to } = window;
    const key = `${kind}:${recipient.id}:${from}`;
    const [existing] = await db.select({ key: emailDelivery.key }).from(emailDelivery).where(eq(emailDelivery.key, key));
    if (existing) continue;
    const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${unsubscribeToken(recipient.id, kind)}`;
    let paragraphs: string[];
    if (kind === "weekly-recap") paragraphs = await recapParagraphs(db, recipient.id, from, to);
    else {
      const workouts = (await listWorkouts(db, recipient.id, from, to)).filter((w) => w.status === "planned");
      if (!workouts.length) continue;
      const weeks = await db.select({ phase: planWeek.phase, focus: planWeek.focus }).from(planWeek)
        .innerJoin(plan, and(eq(plan.id, planWeek.planId), eq(plan.userId, recipient.id), eq(plan.status, "active")))
        .where(eq(planWeek.startDate, from));
      paragraphs = [`Your plan for ${from} to ${to}.`, ...weeks.map((w) => `Phase: ${w.phase}. Focus: ${w.focus}`),
        workouts.map(({ date, workout: w }) => `${date}: ${w.title}${w.kind === "run" ? ` · ${w.distanceKm} km` : " · Strength"}`).join("\n"),
        "This is your current schedule. Check Grind for any changes you accept later."];
    }
    const subject = kind === "weekly-recap" ? `Your training recap · ${from}` : `Your week ahead · ${from}`;
    await enqueueEmail(db, { key, userId: recipient.id, kind, now,
      message: { to: recipient.email, ...emailTemplate(subject, recipient.name, paragraphs, kind === "weekly-recap" ? "View progress" : "View plan", `${baseUrl}/${kind === "weekly-recap" ? "progress" : "plan"}`, unsubscribeUrl), unsubscribeUrl } });
    queued++;
  }
  return { queued };
}
