import Link from "next/link";

import { cn } from "@/lib/utils";

export type FilterTab = {
  key: string;
  label: string;
  /** How many rows the tab holds. */
  count: number;
  href: string;
};

/**
 * A segmented row of links that narrows a list to one group ("Live",
 * "Drafts"), each with its count. Links, not buttons: every tab is a URL.
 * Scrolls sideways on a phone when the tabs don't fit.
 */
export function FilterTabs({
  label,
  tabs,
  current,
  className,
}: {
  /** The row's accessible name, e.g. "Filter campaigns". */
  label: string;
  tabs: FilterTab[];
  current: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}
    >
      <ul className="inline-flex gap-1 rounded-control bg-surface-soft p-1 ring-1 ring-hairline">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-[0.5rem] px-3 text-sm font-medium whitespace-nowrap lg:min-h-8 motion-safe:transition-colors",
                  active
                    ? "bg-white font-semibold text-ink shadow-card ring-1 ring-hairline"
                    : "text-muted hover:text-ink",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    active ? "bg-brand-lilac text-ink" : "bg-surface-card",
                  )}
                >
                  {tab.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
