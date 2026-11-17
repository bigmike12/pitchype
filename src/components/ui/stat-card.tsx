import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import type { Tone } from "@/components/brand/stickers";
import { cn } from "@/lib/utils";

// Written out in full so Tailwind sees each class.
export const TILE_TONES: Record<Tone, string> = {
  sun: "bg-brand-sun",
  lilac: "bg-brand-lilac",
  mint: "bg-brand-mint",
  peach: "bg-brand-peach",
  coral: "bg-brand-coral",
  sky: "bg-brand-sky",
  rose: "bg-brand-rose",
};

/**
 * One figure about the account: a small tinted icon tile and label, the
 * figure in display type, and a line saying what it means. `emphasis` makes
 * it the one ink card on a page (the money someone can act on). With `href`
 * the whole card is a link. Real figures only, never a trend or a chart we
 * can't back with data.
 */
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  href,
  emphasis = false,
}: {
  label: string;
  /** The figure, already formatted. */
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: Tone;
  href?: string;
  emphasis?: boolean;
}) {
  const className = cn(
    "flex flex-col gap-2.5 rounded-card p-4",
    emphasis ? "bg-ink shadow-lift on-dark" : "panel",
    href &&
      "motion-safe:transition-[box-shadow,transform] motion-safe:duration-200 motion-safe:hover:-translate-y-px",
    href &&
      !emphasis &&
      "hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)]",
  );
  const content = (
    <>
      <span
        className={cn(
          "flex items-center gap-2 text-[0.8125rem] font-medium",
          emphasis ? "text-white/75" : "text-muted",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            emphasis
              ? "bg-white/12 text-white"
              : `text-ink ${TILE_TONES[tone]}`,
          )}
        >
          <Icon className="size-4" />
        </span>
        {label}
      </span>
      <span
        className={cn(
          "font-display text-[1.75rem] leading-none font-semibold tracking-[-0.03em] tabular-nums",
          emphasis ? "text-white" : "text-ink",
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "text-[0.8125rem]",
          emphasis ? "text-white/75" : "text-muted",
        )}
      >
        {detail}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
