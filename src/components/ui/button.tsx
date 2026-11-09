import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// Trimmed to the variants the landing page uses, restyled to Pitchype tokens.
// Every size is at least 44px tall so it's an easy tap target.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-sans font-semibold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-60 motion-safe:transition-[background-color,transform] motion-safe:hover:-translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Near-black primary.
        default: "bg-ink text-white hover:bg-[#2b2b2b]",
        // Cream button with a visible outline, for the second choice.
        secondary:
          "border border-field bg-canvas text-ink hover:bg-surface-card",
        // For use on the dark green and ink surfaces.
        light: "bg-canvas text-ink hover:bg-white",
        ghost: "text-ink hover:bg-surface-card",
      },
      size: {
        default: "h-11 px-5 text-[0.9375rem]",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
