import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// shadcn/ui's Button, trimmed to the variants we use and restyled to the
// Pitchype tokens.
// Every size is at least 44px tall so it's an easy tap target.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-sans font-semibold whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-60 motion-safe:transition-[background-color,box-shadow,transform] motion-safe:duration-200 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Near-black primary with a lit top edge.
        default: "bg-ink text-white shadow-button hover:bg-[#26262b]",
        // White button with a firm outline, for the second choice. Buttons
        // are identified by their label, so the outline is decorative.
        secondary:
          "border border-hairline-strong bg-surface text-ink shadow-card hover:border-field/60 hover:bg-surface-soft",
        // For use on the dark green and ink surfaces.
        light: "bg-surface text-ink shadow-card hover:bg-surface-soft",
        ghost: "text-ink hover:bg-ink/5",
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
