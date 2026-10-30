"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Label as LabelPrimitive } from "radix-ui";

const labelVariants = cva(
  "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        /** Wraps a checkbox with its sentence. */
        inline: "gap-3 font-normal",
        /** A tappable card around a radio; the checked one gets a primary border. */
        option:
          "cursor-pointer gap-3 rounded-xl border-2 border-transparent bg-card p-3.5 transition-colors has-data-[state=checked]:border-primary",
        /** The same card with the content stacked and the radio hidden. */
        "option-stacked":
          "relative cursor-pointer flex-col items-start gap-3 rounded-xl border-2 border-transparent bg-card p-3.5 transition-colors has-data-[state=checked]:border-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Label({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Label };
