import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Layout for signed-in pages: the site's header bar (wordmark, sign out) and
 * a readable content column. Static, so it renders instantly while the page
 * streams its signed-in content.
 */
export function AppShell({
  children,
  signOutAction,
}: {
  children: ReactNode;
  signOutAction: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-hairline">
        <div className="container-page flex h-16 items-center justify-between gap-4">
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
      <main id="main" className="container-page flex-1 py-10 sm:py-14">
        <div className="max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
