import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { ClayTile, type Tone } from "@/components/brand/stickers";

export type OverviewRow = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail: string;
  /** The figure on the right, already formatted. */
  value: string;
  /** Where to act on this row. */
  href: string;
};

/**
 * Where a person's work and money stand: one list, each row a link to the
 * place to act on it. A list rather than metric tiles, so the figures read as
 * the state of their account, not as a score.
 */
export function OverviewList({
  title,
  rows,
}: {
  title: string;
  rows: OverviewRow[];
}) {
  return (
    <section aria-labelledby="overview-title" className="rounded-panel panel">
      <h2
        id="overview-title"
        className="px-5 pt-5 text-lg font-semibold sm:px-6 sm:pt-6"
      >
        {title}
      </h2>
      <ul className="mt-3 divide-y divide-hairline">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="group flex min-h-20 items-center gap-4 px-5 py-4 hover:bg-surface-soft motion-safe:transition-colors sm:px-6"
            >
              <ClayTile icon={row.icon} tone={row.tone} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">
                  {row.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  {row.detail}
                </span>
              </span>
              <span className="shrink-0 text-lg font-semibold text-ink tabular-nums">
                {row.value}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted motion-safe:transition-transform group-hover:text-ink motion-safe:group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
