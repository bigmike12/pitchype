"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// shadcn/ui's dialog, trimmed to what we use and restyled to our tokens: a
// white `rounded-panel` card over a dimmed page. Radix brings the focus trap,
// Escape, returning focus to the trigger and hiding the page from screen
// readers while it is open. The entrance is a short fade (motion-safe only).

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  closeLabel = "Close",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  /** The close button's accessible name. */
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-ink/60 motion-safe:animate-[fade-in_0.2s_ease-out]"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-panel bg-surface text-ink shadow-pop outline-none motion-safe:animate-[fade-in_0.25s_var(--ease-out-expo)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-surface/90 text-ink shadow-card ring-1 ring-hairline hover:bg-surface-soft"
        >
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-semibold text-ink", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
};
