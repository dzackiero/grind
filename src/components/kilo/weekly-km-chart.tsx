"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  planned: { label: "Planned", color: "var(--line-strong)" },
  done: { label: "Done", color: "var(--primary)" },
} satisfies ChartConfig;

export interface WeekKm {
  week: number;
  planned: number;
  done: number;
}

/** Planned km per week with completed km drawn over it in lime. */
export function WeeklyKmChart({ data }: { data: WeekKm[] }) {
  return (
    <ChartContainer config={config} height="md">
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={-14}>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          interval={0}
          fontSize={11}
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
              labelFormatter={(w) => `Week ${w}`}
              formatter={(v, name) => [`${v} km`, name === "done" ? " Done" : " Planned"]}
            />
          }
        />
        <Bar dataKey="planned" fill="var(--color-planned)" radius={4} barSize={14} />
        <Bar dataKey="done" fill="var(--color-done)" radius={4} barSize={14} />
      </BarChart>
    </ChartContainer>
  );
}
