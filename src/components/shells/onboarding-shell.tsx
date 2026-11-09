import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Onboarding's page: white, the wordmark and Sign out at the top, and one
 * narrow centred column holding one question at a time.
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
      <header className="flex h-16 items-center justify-between gap-4 px-4 pt-1 sm:px-6">
        <Link
          href="/"
          aria-label="Pitchype home"
          className="-m-1 rounded-lg p-1"
        >
          <Wordmark />
        </Link>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </header>
      <main id="main" className="flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
        <div className="mx-auto w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
