"use client";

import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PacePoint } from "@/lib/activity-detail";
import { formatPace } from "@/lib/plan";

const paceConfig = {
  pace: { label: "Pace", color: "var(--primary)" },
  gap: { label: "Grade-adjusted", color: "var(--muted-foreground)" },
} satisfies ChartConfig;
const elevationConfig = {
  m: { label: "Elevation", color: "var(--accent-ink)" },
} satisfies ChartConfig;

/** The value below which `share` of the values fall; used so a single GPS spike doesn't flatten the chart. */
function percentile(values: number[], share: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** Round tick values from `low` to `high`, so the axis reads 7:30, 8:00, 8:30 instead of 7:55, 9:20, 10:45. */
function roundTicks(low: number, high: number, step: number) {
  const out: number[] = [];
  for (let v = Math.ceil(low / step) * step; v <= high; v += step) out.push(v);
  return out;
}

/** Whole or half kilometres along the bottom, whatever the run's length. */
function distanceTicks(totalKm: number) {
  const step = totalKm <= 4 ? 0.5 : totalKm <= 12 ? 1 : totalKm <= 25 ? 2 : 5;
  const out: number[] = [];
  for (let v = 0; v <= totalKm; v += step) out.push(v);
  return out;
}

/** The tooltip's title. The x value isn't passed as the label on a numeric axis, so read it from the point. */
const kmLabel = (_: unknown, payload: readonly { payload?: { km?: number } }[]) => {
  const km = payload?.[0]?.payload?.km;
  return typeof km === "number" ? `${km.toFixed(2)} km` : "";
};

/** Pace along the run. Faster is higher, as on a watch. The dashed line is pace adjusted for hills. */
export function PaceChart({ series, showGap }: { series: PacePoint[]; showGap: boolean }) {
  const all = series.flatMap((p) => (showGap ? [p.pace, p.gap] : [p.pace]));
  const step = 30;
  const low = Math.floor((percentile(all, 0.01) - 10) / step) * step;
  const high = Math.ceil((percentile(all, 0.97) + 10) / step) * step;
  const totalKm = series.at(-1)?.km ?? 0;
  return (
    <ChartContainer config={paceConfig} height="xl">
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical />
        <XAxis
          dataKey="km"
          type="number"
          domain={[0, "dataMax"]}
          ticks={distanceTicks(totalKm)}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
          unit=" km"
        />
        <YAxis
          reversed
          domain={[low, high]}
          allowDataOverflow
          ticks={roundTicks(low, high, high - low > 150 ? 60 : step)}
          tickLine={false}
          axisLine={false}
          width={44}
          fontSize={11}
          tickFormatter={(v: number) => formatPace(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={kmLabel}
              formatter={(v, name) => [
                `${formatPace(Number(v))}/km`,
                ` ${name === "gap" ? "Grade-adjusted" : "Pace"}`,
              ]}
            />
          }
        />
        <Area
          dataKey="pace"
          type="monotone"
          baseValue={high}
          stroke="var(--color-pace)"
          fill="var(--color-pace)"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {showGap && (
          <Line
            dataKey="gap"
            type="monotone"
            stroke="var(--color-gap)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}

export function ElevationChart({ series }: { series: { km: number; m: number }[] }) {
  const values = series.map((p) => p.m);
  const low = Math.floor(Math.min(...values) - 1);
  const high = Math.ceil(Math.max(...values) + 1);
  const totalKm = series.at(-1)?.km ?? 0;
  return (
    <ChartContainer config={elevationConfig} height="lg">
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical />
        <XAxis
          dataKey="km"
          type="number"
          domain={[0, "dataMax"]}
          ticks={distanceTicks(totalKm)}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          fontSize={11}
          tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
          unit=" km"
        />
        <YAxis
          domain={[low, high]}
          tickLine={false}
          axisLine={false}
          width={36}
          fontSize={11}
          tickCount={5}
          allowDecimals={false}
          unit=" m"
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={kmLabel}
              formatter={(v) => [`${Number(v)} m`, " Elevation"]}
            />
          }
        />
        <Area
          dataKey="m"
          type="monotone"
          stroke="var(--color-m)"
          fill="var(--color-m)"
          fillOpacity={0.2}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
