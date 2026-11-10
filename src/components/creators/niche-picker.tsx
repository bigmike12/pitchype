"use client";

import { FieldMessages } from "@/components/ui/field";
import { MAX_NICHES } from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { cn } from "@/lib/utils";

/**
 * Niche pills (checkboxes named `niches`), at most MAX_NICHES chosen; the
 * rest are disabled once the limit is reached. Controlled: the form that
 * holds it keeps `chosen` in state (see DESIGN_SYSTEM.md, "Forms that hold
 * their own state").
 */
export function NichePicker({
  niches,
  chosen,
  onChange,
  error,
  hint,
}: {
  niches: Niche[];
  chosen: string[];
  onChange: (next: string[]) => void;
  error?: string;
  hint: string;
}) {
  return (
    <fieldset aria-describedby={error ? "niches-error" : "niches-hint"}>
      <legend className="font-semibold text-ink">Niches</legend>
      <p id="niches-hint" className="mt-1 text-sm text-muted">
        {hint}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {niches.map((niche) => {
          const checked = chosen.includes(niche.slug);
          const full = !checked && chosen.length >= MAX_NICHES;
          return (
            <label
              key={niche.slug}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-field bg-white px-4 text-sm font-medium text-ink",
                "has-checked:border-ink has-checked:bg-ink has-checked:text-white",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
                full
                  ? "cursor-not-allowed opacity-50"
                  : "not-has-checked:hover:bg-surface-card",
              )}
            >
              <input
                type="checkbox"
                name="niches"
                value={niche.slug}
                checked={checked}
                disabled={full}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, niche.slug]
                      : chosen.filter((s) => s !== niche.slug),
                  )
                }
                className="sr-only"
              />
              {niche.name}
            </label>
          );
        })}
      </div>
      <FieldMessages id="niches" error={error} />
    </fieldset>
  );
}
