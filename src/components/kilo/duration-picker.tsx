"use client";

import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Race time picker: hours / minutes / seconds as shadcn Selects.
 * `value` is total seconds, or null while nothing is picked.
 */
export function DurationPicker({
  value,
  onChange,
  showHours,
  maxHours = 6,
  disabled,
  className,
}: {
  value: number | null;
  onChange: (seconds: number) => void;
  showHours: boolean;
  maxHours?: number;
  disabled?: boolean;
  className?: string;
}) {
  const total = value ?? 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const update = (nh: number, nm: number, ns: number) => onChange(nh * 3600 + nm * 60 + ns);
  const unset = value === null;

  const part = (
    label: string,
    current: number,
    options: number[],
    set: (v: number) => void,
    suffix: string,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Select
        disabled={disabled}
        value={unset ? undefined : String(current)}
        onValueChange={(v) => set(Number(v))}
      >
        <SelectTrigger aria-label={label} width="full" variant="mono">
          <SelectValue placeholder="--" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={String(o)} variant="mono">
              {suffix === "h" ? o : pad(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-subtle text-center text-xs font-semibold uppercase">{label}</span>
    </div>
  );

  return (
    <div className={cn("flex items-start gap-2", className)}>
      {showHours && part("Hours", h, range(maxHours + 1), (v) => update(v, m, s), "h")}
      {part("Minutes", m, range(60), (v) => update(showHours ? h : 0, v, s), "m")}
      {part("Seconds", s, range(60), (v) => update(showHours ? h : 0, m, v), "s")}
    </div>
  );
}
