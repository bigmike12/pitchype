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
 * The toolbar above a list of campaigns or creators. A plain GET form, so it
 * works without JavaScript and every filtered view is a URL people can
 * share. Under the fields, a footer holds the active filters as chips (each
 * one a link that drops just that filter) and the submit button.
 * `fieldsClassName` is the grid the fields sit in.
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
      className="overflow-hidden rounded-card panel"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-hairline px-4 sm:px-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <SlidersHorizontal
            aria-hidden="true"
            className="size-4 text-brand-violet"
          />
          Filters
          {active.length > 0 && (
            <span className="rounded-full bg-brand-lilac px-2 py-0.5 text-xs font-semibold">
              {active.length}
              <span className="sr-only"> on</span>
            </span>
          )}
        </p>
        {active.length > 0 && (
          <Link
            href={action}
            className="link inline-flex min-h-11 items-center text-sm font-medium"
          >
            Clear all
          </Link>
        )}
      </div>

      <div className={cn("gap-x-4 gap-y-4 p-4 sm:p-5", fieldsClassName)}>
        {children}
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline bg-surface-soft/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        {active.length > 0 && (
          <ul aria-label="Active filters" className="flex flex-wrap gap-2">
            {active.map((filter) => (
              <li key={filter.label}>
                <Link
                  href={filter.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm shadow-card ring-1 ring-hairline-strong hover:ring-ink sm:min-h-9 motion-safe:transition-shadow"
                >
                  <span className="text-muted">{filter.label}</span>
                  <span className="font-medium text-ink">{filter.value}</span>
                  <X aria-hidden="true" className="size-3.5 text-ink" />
                  <span className="sr-only">Remove {filter.label} filter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button type="submit" className="w-full sm:ml-auto sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
