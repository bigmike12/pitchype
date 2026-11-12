import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ClayTile, type Tone } from "@/components/brand/stickers";

/** A quick action: a white card that is one link, with a clay tile. */
export function ActionCard({
  href,
  icon,
  tone,
  title,
  children,
}: {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col rounded-card panel p-4 hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] sm:p-5 motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:hover:-translate-y-px"
    >
      <span
        aria-hidden="true"
        className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-surface-soft text-muted group-hover:bg-ink group-hover:text-white motion-safe:transition-colors sm:top-5 sm:right-5"
      >
        <ArrowUpRight className="size-4" />
      </span>
      <ClayTile icon={icon} tone={tone} size="lg" />
      <span className="mt-4 font-semibold text-ink">{title}</span>
      <span className="mt-1 text-sm">{children}</span>
    </Link>
  );
}
