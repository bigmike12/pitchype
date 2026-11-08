import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/landing/wordmark";

// Sign-up and login aren't linked from the site until launch; keep them out
// of search results too.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Pitchype home"
          className="-m-1 rounded-lg p-1"
        >
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="flex-1 px-4 pt-6 pb-16 sm:pt-12">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
