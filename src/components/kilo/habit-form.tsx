"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HABIT_ICONS,
  HABIT_SUGGESTIONS,
  scheduleLabel,
  WEEKDAY_LABELS,
  type HabitIcon,
} from "@/lib/habits";
import { WEEKDAYS, type Weekday } from "@/lib/plan/dates";
import { HabitIconView, habitIconLabel } from "./habit-icon";

export interface HabitDraft {
  id?: string;
  name: string;
  icon: string;
  days: Weekday[];
}

const FULL_DAY: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Add a habit, or edit one when `habit` has an id. Opens from `trigger`. */
export function HabitForm({ habit, trigger }: { habit?: HabitDraft; trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState<string>(habit?.icon ?? "check");
  const [days, setDays] = useState<Weekday[]>(habit?.days ?? [...WEEKDAYS]);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [saving, startTransition] = useTransition();
  const editing = !!habit?.id;

  const reset = () => {
    setIdeasOpen(false);
    setName(habit?.name ?? "");
    setIcon(habit?.icon ?? "check");
    setDays(habit?.days ?? [...WEEKDAYS]);
  };

  const save = () =>
    startTransition(async () => {
      const res = await fetch(editing ? `/api/habits/${habit!.id}` : "/api/habits", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, icon, days }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(
          body?.issues?.[0]?.message ?? body?.error ?? "Couldn't save the habit. Try again.",
        );
        return;
      }
      toast.success(editing ? "Habit updated." : "Habit added.");
      setOpen(false);
      if (!editing) reset();
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            Pick the days you plan to do it. You tick it off on those days.
          </DialogDescription>
        </DialogHeader>

        {!editing && (
          <Collapsible open={ideasOpen} onOpenChange={setIdeasOpen}>
            <div className="flex flex-col gap-2">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" justify="between">
                  <span className="flex items-center gap-2">
                    <Lightbulb /> Need ideas?
                  </span>
                  <ChevronDown className="transition-transform group-data-[state=open]/button:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-wrap gap-2 pt-1">
                  {HABIT_SUGGESTIONS.map((s) => (
                    <Button
                      key={s.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setName(s.name);
                        setIcon(s.icon);
                        setDays(s.days);
                        setIdeasOpen(false);
                      }}
                    >
                      <HabitIconView icon={s.icon} className="size-4" /> {s.name}
                    </Button>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="habit-name">Name</Label>
          <Input
            id="habit-name"
            value={name}
            maxLength={40}
            placeholder="Stretch for 10 minutes"
            onChange={(e) => setName(e.target.value)}
            size="lg"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="kilo-label">Icon</span>
          <ToggleGroup
            type="single"
            value={icon}
            onValueChange={(v) => v && setIcon(v)}
            variant="outline"
            spacing={2}
            wrap
            aria-label="Icon"
          >
            {HABIT_ICONS.map((key: HabitIcon) => (
              <ToggleGroupItem key={key} value={key} aria-label={habitIconLabel(key)} size="touch">
                <HabitIconView icon={key} className="size-5" />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="kilo-label">Days</span>
            <span className="text-muted-foreground text-xs">
              {days.length ? `${scheduleLabel(days)} · ${days.length} a week` : "Pick at least one"}
            </span>
          </div>
          <ToggleGroup
            type="multiple"
            value={days}
            onValueChange={(v) => setDays(v as Weekday[])}
            variant="outline"
            spacing={1}
            size="touch"
            width="full"
            aria-label="Days"
          >
            {WEEKDAYS.map((d) => (
              <ToggleGroupItem key={d} value={d} aria-label={FULL_DAY[d]}>
                {WEEKDAY_LABELS[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <DialogFooter>
          <Button type="button" disabled={saving || !name.trim() || !days.length} onClick={save}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add habit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
