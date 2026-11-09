import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";

/**
 * The signed-in portal's frame: a white sidebar from 1024px, a top bar over
 * the work area, and the page. The frame is static so it paints at once; the
 * parts that depend on who is signed in arrive through `sidebar` and
 * `topBar`, each streamed in its own Suspense boundary by the layout.
 */
export function PortalShell({
  sidebar,
  topBar,
  children,
}: {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link
            href="/home"
            aria-label="Pitchype home"
            className="-m-1 rounded-lg p-1"
          >
            <Wordmark />
          </Link>
        </div>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-canvas px-4 sm:px-6 lg:h-16 lg:px-8">
          <Link
            href="/home"
            aria-label="Pitchype home"
            className="-m-1 rounded-lg p-1 lg:hidden"
          >
            <Wordmark />
          </Link>
          {topBar}
        </header>
        <main id="main" className="flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
