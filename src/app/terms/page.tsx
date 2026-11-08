import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms (draft)",
  description: "Draft terms for the Pitchype waitlist.",
  alternates: { canonical: "/terms" },
  // Unreviewed legal text shouldn't show up in search results.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
      <p className="rounded-2xl bg-brand-sun px-5 py-4 font-semibold text-ink">
        Draft, to be reviewed by a lawyer before launch. It covers the waitlist
        only.
      </p>

      <h1 className="mt-10 text-display-lg">Terms</h1>

      <div className="mt-8 space-y-8 text-lg [&_h2]:mb-3 [&_h2]:text-display-md">
        <section>
          <h2>Pitchype isn’t live yet</h2>
          <p>
            Right now you can only join the waitlist. Joining doesn’t create an
            account, doesn’t cost anything, and doesn’t commit you to anything.
          </p>
        </section>

        <section>
          <h2>The waitlist</h2>
          <p>
            We’ll use your email address to tell you when Pitchype opens, as
            described in the{" "}
            <Link
              href="/privacy"
              className="font-semibold text-ink underline underline-offset-4"
            >
              privacy notice
            </Link>
            . You can leave the waitlist at any time by emailing{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-ink underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2>Full terms</h2>
          <p>
            Before anyone can post a campaign, apply or pay, we’ll publish full
            terms covering fees, escrow, cancellations, refunds and disputes.
            Nothing on this site is a promise of those terms until then.
          </p>
        </section>
      </div>
    </main>
  );
}
