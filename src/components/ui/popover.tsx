"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// shadcn/ui's popover, restyled to our tokens: a white card that floats over
// the page (hairline and the `pop` shadow), anchored to its trigger. Radix
// brings focus handling, Escape and closing on an outside click.

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 rounded-card bg-surface text-ink shadow-[0_0_0_1px_var(--color-hairline),var(--shadow-pop)] outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
