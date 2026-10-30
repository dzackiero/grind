import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const inputVariants = cva(
  [
    "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-all outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  ],
  {
    variants: {
      size: {
        default: "h-9",
        lg: "h-11",
      },
      variant: {
        default: "",
        /** Codes, keys and other fixed-width text. */
        mono: "font-mono text-xs md:text-xs",
        /** Short numbers: centred, with digits that line up. */
        numeric: "text-center tabular-nums",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

function Input({
  className,
  type,
  size,
  variant,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
