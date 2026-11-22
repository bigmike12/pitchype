import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { BUSINESS_PAGE, CREATOR_PAGE } from "@/lib/signup-link";

import { HeaderCta } from "./header-cta";
import { MobileMenu, type NavLink } from "./mobile-menu";
import { Wordmark } from "@/components/brand/wordmark";

// Root-relative anchors so the same header works on /privacy and /terms.
const NAV_LINKS: NavLink[] = [
  { href: "/#why", label: "Why Pitchype" },
  { href: CREATOR_PAGE, label: "For creators" },
  { href: BUSINESS_PAGE, label: "For businesses" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    // A solid white bar attached to the top edge with rounded bottom corners,
    // after Clay’s nav: the links sit next to the wordmark, the actions at the
    // far right. Its height (56px, 64px from 640px) is what the heroes pull
    // themselves up by, so change them together.
    <header className="sticky top-0 z-40 px-2 sm:px-4">
      <a
        href="#main"
        className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="relative mx-auto flex h-14 max-w-[76rem] items-center justify-between gap-2 rounded-b-2xl pr-2 pl-3 panel sm:h-16 sm:gap-4 sm:rounded-b-panel sm:pl-5">
        <div className="flex items-center gap-6 xl:gap-8">
          <Link
            href="/"
            aria-label="Pitchype home"
            className="-m-1 inline-flex min-h-11 items-center rounded-lg p-1"
          >
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-0.5 xl:gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-full px-2.5 py-2 whitespace-nowrap xl:px-3.5 text-[0.9rem] font-medium text-ink hover:bg-surface-soft motion-safe:transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="mr-1 hidden h-6 w-px bg-hairline-strong lg:block"
          />
          <Link
            href="/login"
            className={buttonVariants({
              variant: "ghost",
              className: "max-sm:hidden",
            })}
          >
            Log in
          </Link>
          <HeaderCta />
          <MobileMenu links={NAV_LINKS} />
        </div>
      </div>
    </header>
  );
}
