import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActiveFilter = {
  /** The filter's name, e.g. "Niche". */
  label: string;
  /** What it is set to, e.g. "Food and drinks". */
  value: string;
  /** The same page with this one filter removed. */
  href: string;
};

/** `action` with `params` as its query string, leaving out empty values. */
export function filterHref(
  action: string,
  params: Record<string, string | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `${action}?${text}` : action;
}

/**
 * The toolbar above a list: one slim white card with the fields in a row and
 * the submit button at its end; filters that are on show underneath as chips
 * (each one a link that drops just that filter) beside "Clear all". A plain
 * GET form, so it works without JavaScript and every filtered view is a URL
 * people can share. Give the fields `compact`. `fieldsClassName` is the grid
 * the fields sit in.
 */
export function FilterBar({
  action,
  label,
  submitLabel,
  active,
  fieldsClassName,
  children,
}: {
  action: string;
  /** The form's accessible name, e.g. "Filter creators". */
  label: string;
  submitLabel: string;
  active: ActiveFilter[];
  fieldsClassName: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      action={action}
      aria-label={label}
      className="rounded-card p-3 panel sm:p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className={cn("min-w-0 flex-1 gap-3", fieldsClassName)}>
          {children}
        </div>
        <Button type="submit" size="sm" className="w-full shrink-0 lg:w-auto">
          <SlidersHorizontal aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>

      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <ul aria-label="Active filters" className="contents">
            {active.map((filter) => (
              <li key={filter.label}>
                <Link
                  href={filter.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-soft px-3 text-[0.8125rem] ring-1 ring-hairline hover:ring-ink lg:min-h-8 motion-safe:transition-shadow"
                >
                  <span className="text-muted">{filter.label}</span>
                  <span className="font-medium text-ink">{filter.value}</span>
                  <X aria-hidden="true" className="size-3.5 text-ink" />
                  <span className="sr-only">Remove {filter.label} filter</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={action}
            className="link ml-auto inline-flex min-h-11 items-center text-[0.8125rem] font-medium lg:min-h-8"
          >
            Clear all
          </Link>
        </div>
      )}
    </form>
  );
}
