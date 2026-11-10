import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { MobileMenu, type NavLink } from "./mobile-menu";
import { Wordmark } from "@/components/brand/wordmark";

// Root-relative anchors so the same header works on /privacy and /terms.
const NAV_LINKS: NavLink[] = [
  { href: "/#why", label: "Why Pitchype" },
  { href: "/#for-creators", label: "For creators" },
  { href: "/#for-businesses", label: "For businesses" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    // A floating glass bar: content scrolls under it, softened by the blur.
    <header className="sticky top-0 z-40 px-2 pt-2 sm:px-4 sm:pt-3">
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="relative mx-auto flex h-14 max-w-[76rem] items-center justify-between gap-4 rounded-2xl pr-2 pl-3 shadow-card ring-1 ring-ink/[0.07] glass sm:h-16 sm:rounded-[1.25rem] sm:pl-4">
        <Link
          href="/"
          aria-label="Pitchype home"
          className="-m-1 rounded-lg p-1"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-0.5 lg:gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-full px-2.5 py-2 text-sm font-medium text-body hover:bg-ink/5 hover:text-ink motion-safe:transition-colors lg:px-3.5"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/login"
            className={buttonVariants({
              variant: "ghost",
              className: "max-sm:hidden",
            })}
          >
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Get started
          </Link>
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
