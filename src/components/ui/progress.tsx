"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Progress as ProgressPrimitive } from "radix-ui";

const progressVariants = cva("relative h-2 w-full overflow-hidden rounded-full", {
  variants: {
    tier: {
      default: "bg-primary/20",
      bronze: "bg-secondary [&>[data-slot=progress-indicator]]:bg-tier-bronze",
      silver: "bg-secondary [&>[data-slot=progress-indicator]]:bg-tier-silver",
      gold: "bg-secondary [&>[data-slot=progress-indicator]]:bg-tier-gold",
      platinum: "bg-secondary [&>[data-slot=progress-indicator]]:bg-tier-platinum",
      lime: "bg-secondary [&>[data-slot=progress-indicator]]:bg-tier-lime",
    },
  },
  defaultVariants: { tier: "default" },
});

function Progress({
  className,
  value,
  tier,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & VariantProps<typeof progressVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(progressVariants({ tier }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 translate-x-(--progress-offset) bg-primary transition-all"
        style={{ "--progress-offset": `-${100 - (value || 0)}%` } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
