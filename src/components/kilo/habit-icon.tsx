import { Apple, BookOpen, Check, Droplets, Footprints, Heart, Moon, PersonStanding, Pill, type LucideIcon } from "lucide-react";
import type { HabitIcon } from "@/lib/habits";

const ICONS: Record<HabitIcon, { icon: LucideIcon; label: string }> = {
  check: { icon: Check, label: "Tick" },
  water: { icon: Droplets, label: "Water" },
  sleep: { icon: Moon, label: "Sleep" },
  stretch: { icon: PersonStanding, label: "Stretch" },
  food: { icon: Apple, label: "Food" },
  read: { icon: BookOpen, label: "Reading" },
  meds: { icon: Pill, label: "Vitamins" },
  walk: { icon: Footprints, label: "Walk" },
  heart: { icon: Heart, label: "Heart" },
};

export const habitIconLabel = (icon: string) => (ICONS[icon as HabitIcon] ?? ICONS.check).label;

/** The picture for a habit; an unknown key falls back to a tick. */
export function HabitIconView({ icon, className }: { icon: string; className?: string }) {
  const Icon = (ICONS[icon as HabitIcon] ?? ICONS.check).icon;
  return <Icon className={className} aria-hidden />;
}
