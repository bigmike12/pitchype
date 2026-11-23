"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The directory's filter fields: a bottom sheet on phones and tablets (opened
 * by the Filters button), and a plain row in the page from 1024px. One native
 * <dialog> inside the search form, so its fields always submit with the form
 * and the browser handles focus, Escape and the backdrop. `active` is how many
 * of its filters are on, shown on the button.
 */
export function FilterSheet({
  active,
  children,
}: {
  active: number;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="lg:hidden"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <SlidersHorizontal aria-hidden="true" />
        Filters
        {active > 0 && (
          <span className="grid size-5 place-items-center rounded-full bg-ink text-[0.6875rem] font-semibold text-white tabular-nums">
            {active}
            <span className="sr-only"> on</span>
          </span>
        )}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="filter-sheet-title"
        // Phones: a sheet from the bottom. From 1024px the closed dialog is
        // shown in place as an ordinary row (author styles beat the
        // browser's display: none for a closed dialog).
        className={cn(
          "fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full max-w-none overflow-auto rounded-t-frame bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-pop backdrop:bg-ink/60 open:motion-safe:animate-[fade-up_0.35s_var(--ease-out-expo)]",
          "lg:static lg:order-first lg:block lg:basis-full lg:max-h-none lg:w-full lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none",
        )}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <h2
            id="filter-sheet-title"
            className="font-display text-xl font-semibold"
          >
            Filters
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="grid size-11 place-items-center rounded-full ring-1 ring-hairline hover:bg-surface-soft"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Close filters</span>
          </button>
        </div>
        {children}
      </dialog>
    </>
  );
}

/** A select that applies itself when changed (the form's button still works without JavaScript). */
export function SubmitOnChange({ children }: { children: ReactNode }) {
  return (
    <div
      onChange={(event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement) target.form?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
