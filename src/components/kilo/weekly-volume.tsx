"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeekTotals } from "@/server/progress/service";
import { addDaysIso, shortDate } from "./format";
import { Stat } from "./stat";

const config = { km: { label: "Kilometers", color: "var(--primary)" } } satisfies ChartConfig;

function duration(minutes: number) {
  if (minutes < 60) return { value: minutes, unit: "min" };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { value: `${h}:${String(m).padStart(2, "0")}`, unit: "h" };
}

/** Kilometers per week for the last weeks; the selected week's totals are shown underneath. */
export function WeeklyVolume({ weeks }: { weeks: WeekTotals[] }) {
  const [selected, setSelected] = useState(weeks.length - 1);
  const week = weeks[selected];
  const time = duration(week.minutes);
  const label =
    selected === weeks.length - 1
      ? "This week"
      : selected === weeks.length - 2
        ? "Last week"
        : `Week of ${shortDate(week.start)}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous week"
          disabled={selected === 0}
          onClick={() => setSelected(selected - 1)}
        >
          <ChevronLeft />
        </Button>
        <div className="text-center" aria-live="polite">
          <div className="font-semibold">{label}</div>
          <div className="text-muted-foreground text-xs">
            {shortDate(week.start)} – {shortDate(addDaysIso(week.start, 6))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next week"
          disabled={selected === weeks.length - 1}
          onClick={() => setSelected(selected + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Kilometers" value={week.km} />
        <Stat label="Time" value={time.value} unit={time.unit} />
        <Stat label="Runs" value={week.runs} />
        <Stat label="Strength" value={week.strength} />
      </div>

      <ChartContainer config={config} className="aspect-auto h-40 w-full">
        <BarChart data={weeks} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="start"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={1}
            fontSize={10}
            tickFormatter={(s: string) => shortDate(s)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={28}
            fontSize={11}
            tickCount={3}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(s) => `Week of ${shortDate(String(s))}`}
                formatter={(v) => [`${v} km`, " Run"]}
              />
            }
          />
          <Bar
            dataKey="km"
            radius={4}
            className="cursor-pointer"
            onClick={(_, index) => setSelected(index)}
          >
            {weeks.map((w, i) => (
              <Cell key={w.start} fill={i === selected ? "var(--primary)" : "var(--line-strong)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
