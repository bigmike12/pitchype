import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ClayTile } from "@/components/brand/stickers";
import { buttonVariants } from "@/components/ui/button";
import {
  stepInfo,
  type BusinessStep,
  type CreatorStep,
} from "@/lib/onboarding";

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
 * One onboarding question: progress bar along the top of the page, clay
 * tile, "Step N of M", heading with a back link (or button), lead, then the
 * question itself. Server pages pass `backHref` implicitly through
 * `stepInfo`; the client screens of the first form pass `onBack`.
 */
export function OnboardingStep({
  role,
  step,
  firstName = "",
  onBack,
  children,
}: {
  role: "business" | "influencer";
  step: BusinessStep | CreatorStep;
  /** For the done step's heading. */
  firstName?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const { number, total, backHref } = stepInfo(role, step);
  const copy =
    step === "done"
      ? { ...DONE_COPY[role], title: DONE_COPY[role].title(firstName) }
      : STEP_COPY[step];

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-[3px] bg-hairline"
      >
        <div
          className="h-full bg-ink motion-safe:transition-[width]"
          style={{ width: `${(number / total) * 100}%` }}
        />
      </div>

      <ClayTile icon={copy.icon} tone={copy.tone} size="lg" />
      <p className="mt-5 text-sm font-medium text-muted">
        Step {number} of {total}
      </p>
      <div className="mt-2 flex items-start gap-1">
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
        <h1 className="min-w-0 text-display-lg break-words">{copy.title}</h1>
      </div>
      <p className="mt-3 text-lg">{copy.lead}</p>
      <div className="mt-8">{children}</div>
    </>
  );
}
