"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { StrengthWorkout } from "@/lib/plan";
import { lastSetText, lastTimeText, newCustomExerciseId, rowsFromLogged, rowsToSets, startingRows, summariseExercise, type LastTime, type SetRow } from "@/lib/strength-log";
import type { LoggedExercise } from "@/server/strength/service";
import { formatDurationShort } from "./format";

type Planned = StrengthWorkout["exercises"][number];

interface Entry {
  id: string;
  name: string;
  /** Null for an exercise the athlete added */
  planned: Planned | null;
  /** Held for time, like a plank: the second box is seconds instead of reps */
  timed: boolean;
  rows: SetRow[];
}

const LOAD_LABEL = { bodyweight: "Bodyweight", light: "Light", moderate: "Moderate", heavy: "Heavy" } as const;
const SAVE_DELAY_MS = 700;
/** Set rows: with a column for what was lifted last time, or without when there is no history yet. Literal for Tailwind. */
const WITH_LAST = "grid-cols-[1.5rem_4.5rem_1fr_1fr_2.75rem]";
const WITHOUT_LAST = "grid-cols-[2rem_1fr_1fr_2.75rem]";

function buildEntries(workout: StrengthWorkout, initial: LoggedExercise[], last: Record<string, LastTime>): Entry[] {
  const logged = new Map(initial.map((l) => [l.exerciseId, l]));
  const planned = workout.exercises.map((ex): Entry => {
    const timed = ex.durationSec !== undefined && ex.reps === undefined;
    const saved = logged.get(ex.id);
    return {
      id: ex.id,
      name: ex.name,
      planned: ex,
      timed,
      rows: saved ? rowsFromLogged(saved.sets, timed) : startingRows({ sets: ex.sets, reps: ex.reps, durationSec: ex.durationSec }, last[ex.name]),
    };
  });
  const plannedIds = new Set(workout.exercises.map((e) => e.id));
  const added = initial.filter((l) => !plannedIds.has(l.exerciseId)).map((l): Entry => ({ id: l.exerciseId, name: l.exerciseName, planned: null, timed: false, rows: rowsFromLogged(l.sets, false) }));
  return [...planned, ...added];
}

/**
 * The exercises of a strength session with sets to log: weight, reps (or seconds) and a tick per set. Rows start
 * from the plan and from what was lifted last time, so a normal session is a few taps. Nothing here is required:
 * the workout is still marked done with the button below it. Changes save by themselves.
 */
export function StrengthLog({ workout, initial, last }: { workout: StrengthWorkout; initial: LoggedExercise[]; last: Record<string, LastTime> }) {
  const router = useRouter();
  const [entries, setEntries] = useState(() => buildEntries(workout, initial, last));
  const entriesRef = useRef(entries);
  const [saving, setSaving] = useState(false);
  /** The last save didn't go through; every save sends the whole exercise, so the next change tries again */
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const pending = useRef(0);
  const waiting = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; entry: Entry }>());
  const url = `/api/workouts/${encodeURIComponent(workout.id)}/sets`;

  const save = async (entry: Entry) => {
    pending.current++;
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exerciseId: entry.id, exerciseName: entry.name, sets: rowsToSets(entry.rows, entry.timed) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.issues?.[0]?.message ?? body?.error ?? "Couldn't save your sets. Try again.");
      }
      setFailed(false);
    } catch (e) {
      setFailed(true);
      toast.error((e as Error).message);
    } finally {
      pending.current--;
      if (pending.current === 0) {
        setSaving(false);
        // Clears the browser's copy of this page, so coming back to it shows what was just saved
        router.refresh();
      }
    }
  };

  /** Save soon after typing stops, or right away for a tick, an added set or a removal. */
  const schedule = (entry: Entry, immediate: boolean) => {
    const previous = waiting.current.get(entry.id);
    if (previous) clearTimeout(previous.timer);
    if (immediate) {
      waiting.current.delete(entry.id);
      void save(entry);
      return;
    }
    waiting.current.set(entry.id, {
      entry,
      timer: setTimeout(() => {
        waiting.current.delete(entry.id);
        void save(entry);
      }, SAVE_DELAY_MS),
    });
  };

  const flushRef = useRef(() => {});
  flushRef.current = () => {
    for (const [id, { timer, entry }] of waiting.current) {
      clearTimeout(timer);
      waiting.current.delete(id);
      void save(entry);
    }
  };
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flushRef.current();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushRef.current();
    };
  }, []);

  const change = (id: string, edit: (rows: SetRow[]) => SetRow[], immediate: boolean) => {
    const current = entriesRef.current.find((e) => e.id === id);
    if (!current) return;
    const next = { ...current, rows: edit(current.rows) };
    entriesRef.current = entriesRef.current.map((e) => (e.id === id ? next : e));
    setEntries(entriesRef.current);
    schedule(next, immediate);
  };

  const removeExercise = (entry: Entry) => {
    entriesRef.current = entriesRef.current.filter((e) => e.id !== entry.id);
    setEntries(entriesRef.current);
    setOpenId(null);
    schedule({ ...entry, rows: [] }, true);
  };

  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    const entry: Entry = { id: newCustomExerciseId(), name, planned: null, timed: false, rows: [{ weight: "", amount: "", done: false }] };
    entriesRef.current = [...entriesRef.current, entry];
    setEntries(entriesRef.current);
    setNewName("");
    setOpenId(entry.id);
    schedule(entry, true);
  };

  const totals = entries.map((e) => summariseExercise(rowsToSets(e.rows, e.timed).map((s) => ({ reps: s.reps, weightKg: s.weightKg, done: s.done }))));
  const setsDone = totals.reduce((n, t) => n + t.setsDone, 0);
  const setsTotal = totals.reduce((n, t) => n + t.setsTotal, 0);
  const volume = Math.round(totals.reduce((n, t) => n + t.volumeKg, 0));
  const counters: Record<string, number> = {};

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground flex items-center justify-between text-[13px]" aria-live="polite">
        <span>
          Sets done{" "}
          <b className="text-foreground tabular-nums">
            {setsDone}/{setsTotal}
          </b>
          {volume > 0 && (
            <>
              {" "}
              · <b className="text-foreground tabular-nums">{volume.toLocaleString("en-US")} kg</b> lifted
            </>
          )}
        </span>
        <span className={cn("text-xs", failed && !saving && "text-destructive font-semibold")}>{saving ? "Saving…" : failed ? "Not saved" : setsDone > 0 ? "Saved" : ""}</span>
      </p>

      <ul className="flex flex-col gap-2">
        {entries.map((entry, index) => {
          const ex = entry.planned;
          if (ex) counters[ex.group] = (counters[ex.group] ?? 0) + 1;
          const summary = totals[index];
          const lastTime = last[entry.name];
          const open = openId === entry.id;
          return (
            <li key={entry.id} className="bg-secondary/40 rounded-xl">
              <Collapsible open={open} onOpenChange={(next) => setOpenId(next ? entry.id : null)}>
                <CollapsibleTrigger asChild>
                  <button type="button" className="focus-visible:ring-ring grid min-h-16 w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-2">
                    <span className="bg-secondary text-type-strength-mark font-display grid size-11 place-items-center rounded-md text-[13px] font-extrabold">
                      {ex ? `${ex.group}${counters[ex.group]}` : <Plus className="size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{entry.name}</span>
                      <span className="text-muted-foreground block font-mono text-[13px]">
                        {ex ? (
                          <>
                            {ex.sets} × {ex.durationSec ? formatDurationShort(ex.durationSec) : ex.reps}
                            {ex.perSide ? " each side" : ""} · rest {formatDurationShort(ex.restSec)}
                            {ex.rir !== undefined ? ` · RIR ${ex.rir}` : ""}
                          </>
                        ) : (
                          "Added by you"
                        )}
                      </span>
                      {ex?.cue && <span className="text-muted-foreground mt-0.5 block text-xs">{ex.cue}</span>}
                      {lastTime && !open && <span className="text-muted-foreground mt-0.5 block text-xs">Last time: {lastTimeText(lastTime)}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("text-xs font-semibold tabular-nums", summary.setsDone > 0 && summary.setsDone === summary.setsTotal ? "text-accent-ink" : "text-muted-foreground")}>
                        {summary.setsDone}/{summary.setsTotal}
                      </span>
                      <ChevronDown className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-180")} aria-hidden />
                    </span>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">
                  {ex && <p className="text-muted-foreground text-xs">{LOAD_LABEL[ex.load]} load</p>}
                  <div className={cn("text-muted-foreground grid items-end gap-2 text-center text-[11px] font-semibold tracking-wide uppercase", lastTime ? WITH_LAST : WITHOUT_LAST)}>
                    <span>Set</span>
                    {lastTime && <span>Last</span>}
                    <span>KG</span>
                    <span>{entry.timed ? "Sec" : "Reps"}</span>
                    <span className="sr-only">Done</span>
                  </div>
                  {entry.rows.map((row, i) => (
                    <div key={i} className={cn("grid items-center gap-2", lastTime ? WITH_LAST : WITHOUT_LAST)}>
                      <span className="text-muted-foreground text-center text-sm tabular-nums">{i + 1}</span>
                      {lastTime && (
                        <span className="text-muted-foreground text-center text-xs tabular-nums" aria-label={`Last time, set ${i + 1}: ${lastSetText(lastTime.sets[i])}`}>
                          {lastSetText(lastTime.sets[i])}
                        </span>
                      )}
                      <Input
                        inputMode="decimal"
                        placeholder="–"
                        value={row.weight}
                        aria-label={`${entry.name}, set ${i + 1}, weight in kilograms`}
                        className="h-11 text-center tabular-nums"
                        onChange={(e) => change(entry.id, (rows) => rows.map((r, j) => (j === i ? { ...r, weight: e.target.value } : r)), false)}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="–"
                        value={row.amount}
                        aria-label={`${entry.name}, set ${i + 1}, ${entry.timed ? "seconds" : "reps"}`}
                        className="h-11 text-center tabular-nums"
                        onChange={(e) => change(entry.id, (rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)), false)}
                      />
                      <label className="grid size-11 cursor-pointer place-items-center">
                        <Checkbox
                          checked={row.done}
                          aria-label={`${entry.name}, set ${i + 1} done`}
                          className="size-7 rounded-[9px]"
                          onCheckedChange={(checked) => change(entry.id, (rows) => rows.map((r, j) => (j === i ? { ...r, done: checked === true } : r)), true)}
                        />
                      </label>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={entry.rows.length >= 20}
                      onClick={() =>
                        change(
                          entry.id,
                          (rows) => {
                            const prev = rows.at(-1);
                            return [...rows, { weight: prev?.weight ?? "", amount: prev?.amount ?? "", done: false }];
                          },
                          true,
                        )
                      }
                    >
                      <Plus /> Add set
                    </Button>
                    {entry.rows.length > 1 && (
                      <Button type="button" variant="ghost" className="h-11" onClick={() => change(entry.id, (rows) => rows.slice(0, -1), true)}>
                        Remove last set
                      </Button>
                    )}
                    {!ex && (
                      <Button type="button" variant="ghost" className="text-destructive h-11" onClick={() => removeExercise(entry)}>
                        Remove exercise
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addExercise();
        }}
      >
        <Input value={newName} maxLength={60} placeholder="Add another exercise" aria-label="Name of an exercise to add" className="h-11" onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={!newName.trim()}>
          <Plus /> Add
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">Logging is optional. Weights are in kg. The workout is still marked done with the button below.</p>
    </div>
  );
}
