import { cacheLife } from "next/cache";
import Link from "next/link";

import { CONTACT_EMAIL } from "@/lib/site";

import { Wordmark } from "./wordmark";

const PRODUCT_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-businesses", label: "For businesses" },
  { href: "/#for-creators", label: "For creators" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

const linkClass = "text-body hover:text-ink hover:underline underline-offset-4";

// Pages are prerendered, so reading the clock has to be cached explicitly
// (Cache Components). Refreshing daily is plenty for a copyright year.
async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-surface-soft">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Wordmark />
            <p className="mt-4 max-w-sm text-sm">
              Pitchype connects Nigerian businesses with micro and nano
              creators, and holds the payment until the work is approved.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 md:col-span-7"
          >
            <div>
              <h2 className="font-semibold">Product</h2>
              <ul className="mt-3 space-y-2">
                {PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-semibold">Legal</h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/privacy" className={linkClass}>
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className={linkClass}>
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="font-semibold">Contact</h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                    {CONTACT_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <p className="mt-12 border-t border-hairline pt-6 text-sm text-muted">
          © <CurrentYear /> Pitchype
        </p>
      </div>
    </footer>
  );
}
