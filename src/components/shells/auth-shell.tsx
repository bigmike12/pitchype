import Link from "next/link";
import type { ReactNode } from "react";

import { AuthScene } from "@/components/brand/auth-scene";
import { Wordmark } from "@/components/brand/wordmark";

const footerLink =
  "text-muted underline-offset-4 hover:text-ink hover:underline";

/**
 * Layout for sign-up, login, password reset and onboarding: a narrow form
 * column (wordmark on top, legal links at the bottom) beside an illustration
 * panel on wide screens. Phones get the form column only.
 */
export function AuthShell({
  children,
  headerAction,
}: {
  children: ReactNode;
  /** Shown at the right of the header, e.g. a sign-out button. */
  headerAction?: ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
          <header className="flex h-20 items-center justify-between gap-4">
            <Link
              href="/"
              aria-label="Pitchype home"
              className="-m-1 rounded-lg p-1"
            >
              <Wordmark />
            </Link>
            {headerAction}
          </header>

          <main id="main" className="flex flex-1 flex-col justify-center py-8">
            {children}
          </main>

          <footer className="flex gap-6 py-6 text-sm">
            <Link href="/privacy" className={footerLink}>
              Privacy
            </Link>
            <Link href="/terms" className={footerLink}>
              Terms
            </Link>
          </footer>
        </div>
      </div>

      <aside aria-hidden="true" className="hidden p-3 lg:block">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)]">
          <AuthScene />
        </div>
      </aside>
    </div>
  );
}

/** Heading block every auth page starts with. */
export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-display-lg">{title}</h1>
      {children && <p className="mt-3 text-lg">{children}</p>}
    </div>
  );
}

/** The "Don't have an account? Sign up" line under a form. */
export function AuthAlternative({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-sm">{children}</p>;
}
