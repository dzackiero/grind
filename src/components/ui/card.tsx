import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const cardVariants = cva(
  "relative flex flex-col rounded-xl border border-transparent bg-card text-card-foreground",
  {
    variants: {
      tone: {
        default: "",
        /** The current or selected card. */
        outline: "border-line-strong",
        /** A highlighted card, such as a coach suggestion. */
        accent: "bg-accent-soft",
      },
      spacing: {
        default: "gap-5 py-5",
        /** For cards whose rows run edge to edge. */
        flush: "gap-0 py-0",
      },
      hoverable: {
        false: "",
        /** Outlines when a parent `group` is hovered, for cards inside a link. */
        true: "group-hover:border-line-strong",
      },
      dimmed: {
        false: "",
        true: "opacity-80",
      },
    },
    defaultVariants: { tone: "default", spacing: "default", hoverable: false, dimmed: false },
  },
);

function Card({
  className,
  tone,
  spacing,
  hoverable,
  dimmed,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ tone, spacing, hoverable, dimmed }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1.5 px-5 [.border-b]:pb-5",
        className,
      )}
      {...props}
    />
  );
}

const cardTitleVariants = cva("text-base leading-none font-semibold", {
  variants: {
    variant: {
      default: "",
      /** Big numbers and page-level names. */
      display: "font-display text-2xl font-extrabold",
      compact: "text-sm font-bold",
    },
    layout: {
      default: "",
      /** An icon or badge beside the title. */
      inline: "flex items-center gap-2",
      /** The title on the left, something else on the right. */
      between: "flex items-center justify-between",
      /** An icon beside a title that may wrap. */
      start: "flex items-start gap-3",
    },
  },
  defaultVariants: { variant: "default", layout: "default" },
});

function CardTitle({
  className,
  variant,
  layout,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardTitleVariants>) {
  return (
    <div
      data-slot="card-title"
      className={cn(cardTitleVariants({ variant, layout }), className)}
      {...props}
    />
  );
}

const cardDescriptionVariants = cva("", {
  variants: {
    variant: {
      default: "text-sm text-muted-foreground",
      /** Small uppercase label above a stat. */
      label: "kilo-label",
    },
  },
  defaultVariants: { variant: "default" },
});

function CardDescription({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardDescriptionVariants>) {
  return (
    <div
      data-slot="card-description"
      className={cn(cardDescriptionVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "relative z-10 col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

const cardContentVariants = cva("px-5", {
  variants: {
    layout: {
      default: "",
      stack: "flex flex-col",
      wrap: "flex flex-wrap",
      "grid-2": "grid grid-cols-2",
      "grid-3": "grid grid-cols-3",
    },
    gap: {
      default: "",
      "1": "gap-1",
      "3": "gap-3",
      "4": "gap-4",
      "5": "gap-5",
      "6": "gap-6",
    },
  },
  defaultVariants: { layout: "default", gap: "default" },
});

function CardContent({
  className,
  layout,
  gap,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardContentVariants>) {
  return (
    <div
      data-slot="card-content"
      className={cn(cardContentVariants({ layout, gap }), className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-5 [.border-t]:pt-5", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
