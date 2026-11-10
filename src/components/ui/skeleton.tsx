import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Loading placeholders for the portal (shadcn/ui's Skeleton, restyled): grey
 * blocks in the shape of the page that is on its way, with a soft light
 * sweeping across them (still with reduced motion). Pages pass them as their
 * Suspense fallback, wrapped in `PageLoading`, which is the one thing screen
 * readers hear. Keep each page's skeleton close to its real layout so
 * nothing jumps when the content arrives.
 */

/** One grey block. Size and shape it with `className`. Decorative. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("rounded-lg skeleton", className)}
      {...props}
    />
  );
}

/**
 * The fallback wrapper: announces `label` once, and fades the skeleton in
 * after a beat so quick loads don't flash it.
 */
export function PageLoading({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "motion-safe:animate-[fade-in_0.4s_ease-out_120ms_both]",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Stands in for `PageHeader`: breadcrumbs, title, lead and an action. */
export function HeaderSkeleton({
  crumbs = false,
  action = false,
  lead = true,
}: {
  crumbs?: boolean;
  action?: boolean;
  lead?: boolean;
}) {
  return (
    <div className="mb-8">
      {crumbs && <Skeleton className="mb-4 h-4 w-40" />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-9 w-3/4 max-w-sm rounded-xl" />
          {lead && <Skeleton className="mt-3 h-5 w-full max-w-md" />}
        </div>
        {action && <Skeleton className="h-11 w-40 rounded-control" />}
      </div>
    </div>
  );
}

/** A section heading inside a page. */
export function SectionTitleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("mb-4 h-7 w-48 rounded-lg", className)} />;
}

/** A white card with a title and a few lines of text. */
export function PanelSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card p-5 panel sm:p-6", className)}>
      <Skeleton className="h-6 w-1/3 min-w-32" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }, (_, line) => (
          <Skeleton
            key={line}
            className={cn("h-4", line === lines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

/** Labelled fields and a submit button, in a white card. */
export function FormSkeleton({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6 rounded-card p-5 panel sm:p-6", className)}>
      {Array.from({ length: fields }, (_, field) => (
        <div key={field}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-12 w-full rounded-control" />
        </div>
      ))}
      <Skeleton className="h-12 w-36 rounded-control" />
    </div>
  );
}

/** The filters toolbar above a directory or campaign list. */
export function FiltersSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-card p-4 panel sm:grid-cols-4 sm:p-5">
      {Array.from({ length: 4 }, (_, field) => (
        <div key={field}>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-12 w-full rounded-control" />
        </div>
      ))}
    </div>
  );
}

const GRID = {
  action: "grid gap-4 sm:grid-cols-3",
  creator: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  campaign: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
} as const;

/**
 * A grid of cards shaped like the real ones: quick actions (`ActionCard`),
 * creator cards (`CreatorCard`) or campaign cards.
 */
export function CardGridSkeleton({
  variant,
  count,
  className,
}: {
  variant: keyof typeof GRID;
  count: number;
  className?: string;
}) {
  return (
    <div className={cn(GRID[variant], className)}>
      {Array.from({ length: count }, (_, card) => (
        <div
          key={card}
          className={cn(
            "flex flex-col rounded-card panel",
            variant === "creator" ? "p-3" : "p-4 sm:p-5",
          )}
        >
          {variant === "action" && (
            <>
              <Skeleton className="size-9 rounded-[0.625rem]" />
              <Skeleton className="mt-4 h-5 w-2/5" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </>
          )}
          {variant === "creator" && (
            <>
              <Skeleton className="aspect-square w-full rounded-card" />
              <Skeleton className="mt-4 h-5 w-1/2" />
              <Skeleton className="mt-2 h-4 w-1/3" />
              <div className="mt-4 flex gap-1.5">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="mt-4 mb-1 h-4 w-3/4" />
            </>
          )}
          {variant === "campaign" && (
            <>
              <div className="flex gap-1.5">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-6 w-4/5" />
              <Skeleton className="mt-2 h-4 w-1/3" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/5" />
              <Skeleton className="mt-6 h-7 w-2/5" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Stands in for `CampaignTable`: a table from 640px, a stacked list on
 * phones, like the real thing.
 */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  const lines = Array.from({ length: rows }, (_, row) => row);
  return (
    <>
      <div className="divide-y divide-hairline rounded-card panel sm:hidden">
        {lines.map((row) => (
          <div key={row} className="space-y-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-card panel sm:block">
        <div className="flex gap-6 bg-surface-soft px-4 py-3.5">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
        <div className="divide-y divide-hairline">
          {lines.map((row) => (
            <div key={row} className="flex items-center gap-6 px-4 py-4">
              <Skeleton className={cn("h-4", row % 2 ? "w-1/4" : "w-1/3")} />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
