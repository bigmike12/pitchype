import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The signed-in portal's frame. From 1024px: a 248px sidebar sitting on the
 * porcelain canvas, and the work area as one white panel inset beside it
 * (hairline, faint shadow, rounded corners; `overflow-clip` keeps the
 * corners clean without breaking the sticky glass top bar). Below 1024px the work area is the
 * whole white page under a glass top bar. The frame is static so it paints
 * at once; the parts that depend on who is signed in arrive through
 * `sidebar` and `topBar`, each streamed in its own Suspense boundary.
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
    <div className="min-h-dvh bg-canvas lg:grid lg:h-dvh lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:overflow-hidden">
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col bg-canvas/95 backdrop-blur-md lg:flex">
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

      <div className="flex min-h-dvh min-w-0 flex-col bg-surface lg:my-2 lg:mr-2 lg:h-[calc(100dvh-1rem)] lg:overflow-clip lg:rounded-frame lg:shadow-[0_0_0_1px_var(--color-hairline),var(--shadow-card)]">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4 glass sm:px-6 lg:h-[3.75rem] lg:px-8">
          <Link
            href="/home"
            aria-label="Pitchype home"
            className="-m-1 rounded-lg p-1 lg:hidden"
          >
            <Wordmark />
          </Link>
          {topBar}
        </header>
        {/* Desktop: only this area scrolls, under the fixed sidebar and header. */}
        <main
          id="main"
          className="flex-1 px-4 py-6 enter md:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** The sidebar while we find out who is signed in: links and account card. */
export function SidebarSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col px-3 pb-4">
      <div className="flex-1 space-y-0.5 pt-2">
        <Skeleton className="mb-2 ml-3 h-3 w-12" />
        {[60, 72, 84, 52].map((width) => (
          <div
            key={width}
            className="flex min-h-[2.375rem] items-center gap-2.5 px-3"
          >
            <Skeleton className="size-[1.125rem] rounded-md" />
            <Skeleton className="h-4" style={{ width }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-card p-3 panel">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </div>
  );
}

/** The top bar's right-hand side while it loads: the main action and Help. */
export function TopBarSkeleton() {
  return (
    <div aria-hidden="true" className="ml-auto flex items-center gap-2">
      <Skeleton className="h-9 w-32 rounded-control max-lg:hidden" />
      <Skeleton className="size-11 rounded-control" />
      <Skeleton className="size-11 rounded-control lg:hidden" />
    </div>
  );
}
