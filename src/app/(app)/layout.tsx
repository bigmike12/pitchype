import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";

import { signOutAction } from "./actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Static chrome: nothing here reads the session, so it renders instantly and
// each page streams its signed-in content behind a Suspense boundary.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
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
        </div>
      </header>
      <main id="main" className="flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
