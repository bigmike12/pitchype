// Small pieces of the product UI, drawn in HTML/CSS with fictional sample
// data. Each fragment is exposed to assistive tech as one labelled image so
// screen readers hear what it shows rather than a pile of fake buttons.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full bg-surface-card px-2 py-0.5 text-xs font-semibold text-muted",
        className,
      )}
    >
      Sample
    </span>
  );
}

export function ProductFragment({
  label,
  className,
  children,
}: {
  /** What the fragment shows, read out in place of its contents. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={`Sample screen: ${label}`}
      className={cn(
        "relative rounded-2xl bg-canvas p-4 text-sm text-ink",
        className,
      )}
    >
      <SampleTag className="absolute top-3 right-3" />
      {children}
    </div>
  );
}

const AVATAR_COLOURS = {
  coral: "bg-brand-coral",
  lilac: "bg-brand-lilac",
  sun: "bg-brand-sun",
  peach: "bg-brand-peach",
  mint: "bg-brand-mint",
} as const;

/** Initials on a coloured circle. Never a photo (no real people on the site). */
export function Avatar({
  initials,
  colour,
  className,
}: {
  initials: string;
  colour: keyof typeof AVATAR_COLOURS;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-ink",
        AVATAR_COLOURS[colour],
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-hairline bg-white px-2.5 py-1 text-xs font-medium text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
