"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "cn";
import {
  ArrowLeft,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  House,
  Leaf,
  Medal,
  Rocket,
  Sprout,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DurationPicker } from "@/components/kilo/duration-picker";
import { SegmentedProgress } from "@/components/kilo/segmented-progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";
import { GOAL_TEMPLATES, RACE_DISTANCE_M, type PlanInput } from "@/lib/plan";

type Weekday = PlanInput["runDays"][number];
const DAYS: { value: Weekday; short: string; long: string }[] = [
  { value: "mon", short: "M", long: "Monday" },
  { value: "tue", short: "T", long: "Tuesday" },
  { value: "wed", short: "W", long: "Wednesday" },
  { value: "thu", short: "T", long: "Thursday" },
  { value: "fri", short: "F", long: "Friday" },
  { value: "sat", short: "S", long: "Saturday" },
  { value: "sun", short: "S", long: "Sunday" },
];
const dayOrder = (d: Weekday) => DAYS.findIndex((x) => x.value === d);

interface FormState {
  goal: PlanInput["goal"];
  raceDate: string;
  noRace: boolean;
  experience: PlanInput["experience"];
  weeklyKm: string;
  raceDistance: "none" | PlanInput["goal"];
  /** Total seconds, or null when not picked */
  raceTimeSec: number | null;
  runDays: Weekday[];
  longRunDay: Weekday | "";
  strengthDays: Weekday[];
  equipment: PlanInput["strength"]["equipment"];
  intensity: PlanInput["intensity"];
}

const STEPS = ["Goal", "Race day", "Your running", "Run days", "Strength", "Intensity"] as const;

const MAX_STRENGTH_DAYS = 5;

const STRENGTH_SPLITS: Record<number, string> = {
  0: "Running only.",
  1: "One Full Body session.",
  2: "Legs & Core, plus Upper Body.",
  3: "Legs & Core, Upper Body and Full Body.",
  4: "Upper/lower split, twice: Legs & Core and Upper Body, two of each.",
  5: "Two Legs & Core, two Upper Body and one Full Body.",
};

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weeksUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (7 * 86_400_000));
}

/**
 * Big tappable radio option built on shadcn RadioGroupItem: coloured icon tile, title, description.
 * `tone` is the tile's background + icon colour (workout-type or plate colours from the theme).
 */
function OptionCard({
  value,
  title,
  description,
  current,
  icon: Icon,
  tone,
  compact,
}: {
  value: string;
  title: string;
  description?: string;
  current: string;
  icon: LucideIcon;
  tone: string;
  compact?: boolean;
}) {
  const selected = current === value;
  return (
    <Label
      htmlFor={`opt-${value}`}
      className={cn(
        "bg-card flex cursor-pointer items-center gap-3 rounded-xl border-2 border-transparent p-3.5 transition-colors",
        compact && "relative flex-col items-start",
        selected && "border-primary",
      )}
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-md transition-transform",
          tone,
          selected && "scale-105",
        )}
      >
        <Icon className="size-[22px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-lg leading-6 font-extrabold">{title}</span>
        {description && (
          <span className="text-muted-foreground text-sm leading-5 font-normal">{description}</span>
        )}
      </span>
      <RadioGroupItem
        id={`opt-${value}`}
        value={value}
        aria-label={title}
        className={cn(compact && "absolute opacity-0")}
      />
    </Label>
  );
}

function DayPicker({
  value,
  onChange,
  label,
}: {
  value: Weekday[];
  onChange: (v: Weekday[]) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={value}
      onValueChange={(v) => onChange((v as Weekday[]).sort((a, b) => dayOrder(a) - dayOrder(b)))}
      aria-label={label}
      className="w-full"
    >
      {DAYS.map((d) => (
        <ToggleGroupItem
          key={d.value}
          value={d.value}
          aria-label={d.long}
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-11 flex-1 font-bold"
        >
          {d.short}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function OnboardingForm({
  firstName,
  guestName,
  hasPlan,
}: {
  firstName: string;
  /** Current name when this is a guest account (empty until they give one), otherwise null. */ guestName:
    | string
    | null;
  hasPlan: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(guestName ?? "");
  const [f, setF] = useState<FormState>({
    goal: "half",
    raceDate: "",
    noRace: false,
    experience: "intermediate",
    weeklyKm: "15",
    raceDistance: "5k",
    raceTimeSec: null,
    runDays: ["wed", "fri", "sun"],
    longRunDay: "sun",
    strengthDays: [],
    equipment: "gym",
    intensity: "balanced",
  });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));
  const tpl = GOAL_TEMPLATES[f.goal];
  const greeting = guestName === null ? firstName : name.trim().split(" ")[0];

  function stepError(): string | null {
    switch (step) {
      case 1:
        if (f.noRace) return null;
        if (!f.raceDate) return "Pick your race date, or choose no race.";
        if (f.raceDate <= localToday()) return "Race day needs to be in the future.";
        return null;
      case 2: {
        const kmValue = Number(f.weeklyKm);
        if (!Number.isFinite(kmValue) || kmValue < 0 || kmValue > 250)
          return "Enter your weekly distance in km (0–250).";
        if (f.raceDistance !== "none" && f.raceTimeSec !== null && f.raceTimeSec < 150)
          return "That finish time looks too short. Check the minutes.";
        return null;
      }
      case 3:
        if (!f.runDays.length) return "Pick at least one run day.";
        if (!f.longRunDay || !f.runDays.includes(f.longRunDay))
          return "Pick which run day is your long run.";
        return null;
      default:
        return null;
    }
  }

  function next() {
    const problem = stepError();
    if (problem) return setError(problem);
    setError(null);
    // Guests can give a name here; it shows in greetings and carries over when they save the account
    if (step === 0 && guestName !== null && name.trim() && name.trim() !== guestName)
      void authClient.updateUser({ name: name.trim() }).then(() => router.refresh());
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  }

  function submit() {
    const sessions = f.strengthDays.length;
    const time = f.raceDistance !== "none" ? f.raceTimeSec : null;
    const input: PlanInput = {
      goal: f.goal,
      raceDate: f.noRace ? undefined : f.raceDate,
      startDate: localToday(),
      experience: f.experience,
      currentWeeklyKm: Number(f.weeklyKm),
      recentRace:
        time && f.raceDistance !== "none"
          ? { distanceM: RACE_DISTANCE_M[f.raceDistance], timeSec: time }
          : undefined,
      runDays: f.runDays,
      longRunDay: f.longRunDay as Weekday,
      strength: { sessionsPerWeek: sessions, days: f.strengthDays, equipment: f.equipment },
      intensity: f.intensity,
    };
    startTransition(async () => {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          body?.issues?.[0]?.message ??
            body?.errors?.[0]?.message ??
            body?.error ??
            "Couldn't build the plan. Try again.",
        );
        return;
      }
      router.push("/today");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3">
        <SegmentedProgress done={step + 1} total={STEPS.length} />
        <p className="kilo-label">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      <section className="flex flex-1 flex-col gap-5" aria-live="polite">
        {step === 0 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">
              {hasPlan
                ? "Start a new plan"
                : greeting
                  ? `Hi ${greeting}, what are you training for?`
                  : "What are you training for?"}
            </h1>
            {hasPlan && (
              <p className="text-muted-foreground text-sm">
                Your current plan will be archived when the new one is ready.
              </p>
            )}
            {guestName !== null && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="guestName">What should we call you? (optional)</Label>
                <Input
                  id="guestName"
                  autoComplete="given-name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                />
              </div>
            )}
            <RadioGroup
              value={f.goal}
              onValueChange={(v) => set("goal", v as FormState["goal"])}
              className="gap-3"
            >
              {/* Goal tiles use the PR plate colours: 5K green, 10K yellow, half blue, marathon red */}
              <OptionCard
                value="5k"
                current={f.goal}
                icon={Zap}
                tone="bg-plate-green text-white"
                title="5K"
                description={`${GOAL_TEMPLATES["5k"].minWeeks}–${GOAL_TEMPLATES["5k"].maxWeeks} weeks. Get faster over a short distance.`}
              />
              <OptionCard
                value="10k"
                current={f.goal}
                icon={Timer}
                tone="bg-plate-yellow text-on-type"
                title="10K"
                description={`${GOAL_TEMPLATES["10k"].minWeeks}–${GOAL_TEMPLATES["10k"].maxWeeks} weeks. Speed with more endurance.`}
              />
              <OptionCard
                value="half"
                current={f.goal}
                icon={Medal}
                tone="bg-plate-blue text-white"
                title="Half marathon"
                description={`${GOAL_TEMPLATES.half.minWeeks}–${GOAL_TEMPLATES.half.maxWeeks} weeks. 21.1 km.`}
              />
              <OptionCard
                value="marathon"
                current={f.goal}
                icon={Trophy}
                tone="bg-plate-red text-white"
                title="Marathon"
                description={`${GOAL_TEMPLATES.marathon.minWeeks}–${GOAL_TEMPLATES.marathon.maxWeeks} weeks. 42.2 km.`}
              />
            </RadioGroup>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">When is race day?</h1>
            <div className="flex flex-col gap-2">
              <Label htmlFor="raceDate">Race date</Label>
              <Input
                id="raceDate"
                type="date"
                min={localToday()}
                value={f.raceDate}
                disabled={f.noRace}
                onChange={(e) => set("raceDate", e.target.value)}
              />
              {f.raceDate && !f.noRace && (
                <p className="text-muted-foreground text-sm">
                  {weeksUntil(f.raceDate)} weeks away.{" "}
                  {weeksUntil(f.raceDate) > tpl.maxWeeks
                    ? `The plan will start ${tpl.maxWeeks} weeks before race day.`
                    : weeksUntil(f.raceDate) < tpl.minWeeks
                      ? `That's short for a ${tpl.label}; ${tpl.minWeeks}+ weeks is better. The plan will stay conservative.`
                      : ""}
                </p>
              )}
            </div>
            <Label htmlFor="noRace" className="flex items-center gap-3 font-normal">
              <Checkbox
                id="noRace"
                checked={f.noRace}
                onCheckedChange={(v) => set("noRace", v === true)}
              />
              No race, just get fitter ({tpl.defaultWeeks}-week plan)
            </Label>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">Tell us about your running</h1>
            <RadioGroup
              value={f.experience}
              onValueChange={(v) => set("experience", v as FormState["experience"])}
              className="gap-3"
            >
              <OptionCard
                value="beginner"
                current={f.experience}
                icon={Sprout}
                tone="bg-type-easy text-on-type"
                title="New to running"
                description="Running for less than a year, or coming back after a break."
              />
              <OptionCard
                value="intermediate"
                current={f.experience}
                icon={Footprints}
                tone="bg-type-tempo text-on-type"
                title="Regular runner"
                description="Running most weeks and have done a few races."
              />
              <OptionCard
                value="advanced"
                current={f.experience}
                icon={Flame}
                tone="bg-type-intervals text-on-type"
                title="Experienced"
                description="Years of consistent training and structured workouts."
              />
            </RadioGroup>
            <div className="flex flex-col gap-2">
              <Label htmlFor="weeklyKm">Kilometers per week lately</Label>
              <Input
                id="weeklyKm"
                type="number"
                inputMode="decimal"
                min={0}
                max={250}
                value={f.weeklyKm}
                onChange={(e) => set("weeklyKm", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Recent race or time trial (for your paces)</Label>
              <Select
                value={f.raceDistance}
                onValueChange={(v) => set("raceDistance", v as FormState["raceDistance"])}
              >
                <SelectTrigger aria-label="Race distance" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No recent race</SelectItem>
                  <SelectItem value="5k">5K</SelectItem>
                  <SelectItem value="10k">10K</SelectItem>
                  <SelectItem value="half">Half marathon</SelectItem>
                  <SelectItem value="marathon">Marathon</SelectItem>
                </SelectContent>
              </Select>
              {f.raceDistance !== "none" && (
                <DurationPicker
                  value={f.raceTimeSec}
                  onChange={(sec) => set("raceTimeSec", sec)}
                  showHours={f.raceDistance !== "5k"}
                />
              )}
              <p className="text-muted-foreground text-xs">
                Skip it and we&apos;ll start with safe paces. Your intervals.icu data will refine
                them later.
              </p>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">Which days can you run?</h1>
            <div className="flex flex-col gap-2">
              <Label>Run days (as many as you like)</Label>
              <DayPicker
                label="Run days"
                value={f.runDays}
                onChange={(v) => {
                  set("runDays", v);
                  if (f.longRunDay && !v.includes(f.longRunDay)) set("longRunDay", v.at(-1) ?? "");
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Long run day</Label>
              <Select value={f.longRunDay} onValueChange={(v) => set("longRunDay", v as Weekday)}>
                <SelectTrigger aria-label="Long run day" className="w-full">
                  <SelectValue placeholder="Pick a day" />
                </SelectTrigger>
                <SelectContent>
                  {f.runDays.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DAYS.find((x) => x.value === d)!.long}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {f.runDays.length === 7 && (
              <p className="text-warning text-sm">
                Running every day leaves no rest day. That only suits experienced runners.
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              {f.runDays.length === 1
                ? "One run a week is your long run. Add more days whenever you can."
                : "Hard sessions are spaced so they never land on back-to-back days."}
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">Add strength training</h1>
            <div className="flex flex-col gap-2">
              <Label>Strength days (optional, up to {MAX_STRENGTH_DAYS})</Label>
              <DayPicker
                label="Strength days"
                value={f.strengthDays}
                onChange={(v) => set("strengthDays", v.slice(-MAX_STRENGTH_DAYS))}
              />
              <p className="text-muted-foreground text-xs">
                {f.strengthDays.length
                  ? STRENGTH_SPLITS[f.strengthDays.length]
                  : "No days picked: Grind plans running only. You can skip this step."}
              </p>
            </div>
            {f.strengthDays.length > 0 && (
              <>
                {new Set([...f.runDays, ...f.strengthDays]).size === 7 && (
                  <p className="text-warning text-sm">
                    No rest day left in your week. That works for experienced athletes; otherwise
                    pair some strength days with run days.
                  </p>
                )}
                <RadioGroup
                  value={f.equipment}
                  onValueChange={(v) => set("equipment", v as FormState["equipment"])}
                  className="grid grid-cols-2 gap-3"
                >
                  <OptionCard
                    compact
                    value="gym"
                    current={f.equipment}
                    icon={Dumbbell}
                    tone="bg-type-strength text-on-type"
                    title="Gym"
                    description="Dumbbells, barbell"
                  />
                  <OptionCard
                    compact
                    value="bodyweight"
                    current={f.equipment}
                    icon={House}
                    tone="bg-type-strength text-on-type"
                    title="At home"
                    description="Bodyweight only"
                  />
                </RadioGroup>
              </>
            )}
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="font-display text-3xl font-extrabold">How hard should we push?</h1>
            <RadioGroup
              value={f.intensity}
              onValueChange={(v) => set("intensity", v as FormState["intensity"])}
              className="gap-3"
            >
              <OptionCard
                value="steady"
                current={f.intensity}
                icon={Leaf}
                tone="bg-type-easy text-on-type"
                title="Steady"
                description="Gentle build. Good if you're busy or prone to niggles."
              />
              <OptionCard
                value="balanced"
                current={f.intensity}
                icon={Gauge}
                tone="bg-type-tempo text-on-type"
                title="Balanced"
                description="A steady climb in distance with quality sessions most weeks."
              />
              <OptionCard
                value="push"
                current={f.intensity}
                icon={Rocket}
                tone="bg-type-race text-on-type"
                title="Push me"
                description="Bigger weeks and more speed work. For when you have time to recover."
              />
            </RadioGroup>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </section>

      <div className="bg-background sticky bottom-0 flex gap-3 py-4">
        {step > 0 && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => (setError(null), setStep(step - 1))}
            disabled={pending}
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={next} disabled={pending}>
          {pending
            ? "Building your plan…"
            : step === STEPS.length - 1
              ? "Build my plan"
              : "Continue"}
        </Button>
      </div>
    </div>
  );
}
