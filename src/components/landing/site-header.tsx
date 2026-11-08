import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { MobileMenu, type NavLink } from "./mobile-menu";
import { Wordmark } from "./wordmark";

// Root-relative anchors so the same header works on /privacy and /terms.
const NAV_LINKS: NavLink[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-businesses", label: "For businesses" },
  { href: "/#for-creators", label: "For creators" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Pitchype home"
          className="-m-1 rounded-lg p-1"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-0.5 lg:gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-lg px-2 py-2 text-sm font-medium text-ink hover:bg-surface-card lg:px-3"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/#waitlist"
            aria-label="Join the waitlist"
            className={buttonVariants({ className: "max-lg:px-4" })}
          >
            <span className="lg:hidden">Join</span>
            <span className="max-lg:hidden">Join the waitlist</span>
          </Link>
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
