"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select doesn't allow an empty item value, so "no filter" is this sentinel and is left out of the query.
const ALL = "all";

const TYPES = [
  { value: "run", label: "Run" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

function Filter({
  label,
  name,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  const id = `history-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} width="full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value !== ALL && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

export function HistoryFilters({
  years,
  months,
  type,
  year,
  month,
}: {
  years: number[];
  months: string[];
  type?: string;
  year?: number;
  month?: number;
}) {
  const [typeValue, setType] = useState(type || ALL);
  const [yearValue, setYear] = useState(year ? String(year) : ALL);
  const [monthValue, setMonth] = useState(month ? String(month) : ALL);
  return (
    <form action="/progress" className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <Filter
        label="Workout type"
        name="type"
        value={typeValue}
        onChange={setType}
        allLabel="All types"
        options={TYPES}
      />
      <Filter
        label="Year"
        name="year"
        value={yearValue}
        onChange={setYear}
        allLabel="All years"
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
      />
      <Filter
        label="Month"
        name="month"
        value={monthValue}
        onChange={setMonth}
        allLabel="All months"
        options={months.map((m, i) => ({ value: String(i + 1), label: m }))}
      />
      <Button type="submit">Apply filters</Button>
    </form>
  );
}
