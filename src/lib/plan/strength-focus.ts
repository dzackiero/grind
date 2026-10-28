import type { StrengthWorkout } from "./schema";

type Focus = StrengthWorkout["focus"];

export const STRENGTH_FOCUS_LABELS: Record<Focus, string> = {
  legs_core: "Legs & Core",
  upper: "Upper Body",
  full: "Full Body",
  lower: "Lower Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  core: "Core",
  posterior_chain: "Posterior Chain",
  chest_back: "Chest & Back",
  shoulders_arms: "Shoulders & Arms",
};

export function strengthUsesLegs(focus: Focus): boolean {
  return focus === "legs_core" || focus === "full" || focus === "lower" || focus === "legs" || focus === "posterior_chain";
}
