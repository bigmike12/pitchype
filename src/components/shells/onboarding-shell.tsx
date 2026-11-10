import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Onboarding's page: the porcelain canvas, the wordmark (centred from 640px)
 * and Sign out at the top, and room for one framed step at a time. Each step
 * (`OnboardingStep`) draws its own frame: the question beside an aurora
 * panel that says why we ask.
 */
export function OnboardingShell({
  children,
  signOutAction,
}: {
  children: ReactNode;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="relative flex h-16 items-center justify-between gap-4 px-4 pt-1 sm:h-20 sm:px-6">
        <Link
          href="/"
          aria-label="Pitchype home"
          className="-m-1 rounded-lg p-1 sm:absolute sm:left-1/2 sm:-translate-x-1/2"
        >
          <Wordmark />
        </Link>
        <form action={signOutAction} className="sm:ml-auto">
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </header>
      <main id="main" className="flex-1 px-2 pb-10 sm:px-6">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
