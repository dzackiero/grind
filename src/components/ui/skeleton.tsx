import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const skeletonVariants = cva("animate-pulse bg-accent", {
  variants: {
    shape: {
      default: "rounded-md",
      /** A page title. */
      title: "h-9 w-44 rounded-md",
      /** A full-width bar, such as a toolbar. */
      bar: "h-12 w-full rounded-xl",
      /** A full-width card, in two heights. */
      "card-sm": "h-24 w-full rounded-xl",
      card: "h-32 w-full rounded-xl",
    },
  },
  defaultVariants: { shape: "default" },
});

function Skeleton({
  className,
  shape,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div data-slot="skeleton" className={cn(skeletonVariants({ shape }), className)} {...props} />
  );
}

export { Skeleton };
