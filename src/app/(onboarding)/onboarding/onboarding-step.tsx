import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ClayTile } from "@/components/brand/stickers";
import { buttonVariants } from "@/components/ui/button";
import { PageLoading, Skeleton } from "@/components/ui/skeleton";
import {
  stepInfo,
  type BusinessStep,
  type CreatorStep,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

import { DONE_COPY, STEP_COPY } from "./steps";

const backClass = buttonVariants({
  variant: "ghost",
  size: "icon",
  className: "-ml-2.5 shrink-0",
});

/** The row under a step's question: Continue (or Skip) and "Finish later". */
export function StepActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
      {children}
      <Link href="/home" className="link text-center sm:ml-2">
        Finish later
      </Link>
    </div>
  );
}

export const continueClass = buttonVariants({
  size: "lg",
  className: "w-full sm:w-auto",
});

/**
 * One onboarding question, framed: the question on one side and an aurora
 * panel on the other with a card saying why we ask (after the question on
 * phones). `showcase` replaces that card with something to look at, such as
 * the creator's new directory card; it then comes first on phones too.
 * A progress bar runs along the top of the page. Server pages get the back
 * link from `stepInfo`; the client screens of the first form pass `onBack`.
 */
export function OnboardingStep({
  role,
  step,
  firstName = "",
  onBack,
  showcase,
  children,
}: {
  role: "business" | "influencer";
  step: BusinessStep | CreatorStep;
  /** For the done step's heading. */
  firstName?: string;
  onBack?: () => void;
  showcase?: ReactNode;
  children: ReactNode;
}) {
  const { number, total, backHref } = stepInfo(role, step);
  const copy =
    step === "done"
      ? { ...DONE_COPY[role], title: DONE_COPY[role].title(firstName) }
      : STEP_COPY[step];
  // The panel alternates between the cool and warm aurora as you go.
  const aurora = number % 2 === 0 ? "aurora-warm" : "aurora";

  const panel = (
    <aside
      aria-label={showcase ? "Preview" : "Why we ask"}
      className={cn(
        "relative isolate flex items-center justify-center overflow-hidden rounded-[1.25rem] p-5 sm:p-10",
        aurora,
        showcase ? "min-h-72" : "max-lg:order-last lg:order-first",
      )}
    >
      {showcase ?? (
        <div className="w-full max-w-sm rounded-panel bg-white/85 p-6 shadow-pop ring-1 ring-ink/[0.06] glass enter sm:p-7">
          <ClayTile icon={copy.icon} tone={copy.tone} size="lg" />
          <h2 className="mt-5 text-display-md">{copy.why.title}</h2>
          <p className="mt-3">{copy.why.text}</p>
        </div>
      )}
    </aside>
  );

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-[3px] bg-ink/5"
      >
        <div
          className="h-full rounded-r-full bg-[linear-gradient(90deg,var(--color-brand-coral),var(--color-brand-violet))] motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-[var(--ease-out-expo)]"
          style={{ width: `${(number / total) * 100}%` }}
        />
      </div>

      <div className="grid gap-2 rounded-frame p-2 panel lg:min-h-[min(46rem,calc(100dvh-7.5rem))] lg:grid-cols-2">
        {showcase ? panel : null}

        <div className="flex flex-col justify-center px-3 py-8 sm:px-8 sm:py-12 lg:px-12 xl:px-16">
          <div className="w-full max-w-lg enter">
            <div className="flex items-center gap-3">
              {/* Segmented progress, for sighted users; the text says it. */}
              <span aria-hidden="true" className="flex gap-1">
                {Array.from({ length: total }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 rounded-full motion-safe:transition-all",
                      index < number ? "w-5 bg-ink" : "w-1.5 bg-surface-card",
                    )}
                  />
                ))}
              </span>
              <p className="text-sm font-medium text-muted">
                Step {number} of {total}
              </p>
            </div>
            <div className="mt-4 flex items-start gap-1">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className={backClass}
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
              ) : backHref ? (
                <Link href={backHref} aria-label="Back" className={backClass}>
                  <ArrowLeft aria-hidden="true" />
                </Link>
              ) : null}
              <h1 className="min-w-0 text-display-lg break-words">
                {copy.title}
              </h1>
            </div>
            <p className="mt-3 text-lg">{copy.lead}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        {showcase ? null : panel}
      </div>
    </>
  );
}

/** The loading state of a step: the same frame, in grey. */
export function OnboardingStepSkeleton({ label }: { label: string }) {
  return (
    <PageLoading label={label}>
      <div className="grid gap-2 rounded-frame p-2 panel lg:min-h-[min(46rem,calc(100dvh-7.5rem))] lg:grid-cols-2">
        <div className="flex flex-col justify-center px-3 py-8 sm:px-8 sm:py-12 lg:px-12 xl:px-16">
          <div className="w-full max-w-lg">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-5 h-11 w-4/5 rounded-xl" />
            <Skeleton className="mt-3 h-5 w-3/5" />
            <Skeleton className="mt-10 h-4 w-28" />
            <Skeleton className="mt-2 h-12 w-full rounded-control" />
            <Skeleton className="mt-8 h-12 w-36 rounded-control" />
          </div>
        </div>
        <div className="flex min-h-56 items-center justify-center rounded-[1.25rem] p-5 aurora max-lg:order-last sm:p-10 lg:order-first">
          <div className="w-full max-w-sm rounded-panel bg-white/70 p-6 ring-1 ring-ink/[0.06] sm:p-7">
            <Skeleton className="size-12 rounded-[0.875rem]" />
            <Skeleton className="mt-5 h-7 w-3/4" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
