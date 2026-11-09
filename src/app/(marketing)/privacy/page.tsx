import type { Metadata } from "next";

import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice (draft)",
  description:
    "How Pitchype handles the details you give us when you join the waitlist.",
  alternates: { canonical: "/privacy" },
  // Unreviewed legal text shouldn't show up in search results.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
      <p className="rounded-card bg-brand-sun px-5 py-4 font-semibold text-ink">
        Draft, to be reviewed by a lawyer before launch. It covers the waitlist
        only.
      </p>

      <h1 className="mt-10 text-display-lg">Privacy notice</h1>

      <div className="mt-8 space-y-8 text-lg [&_h2]:mb-3 [&_h2]:text-display-md [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <section>
          <h2>What we collect</h2>
          <p>When you join the waitlist, we store:</p>
          <ul className="mt-3">
            <li>your email address;</li>
            <li>whether you joined as a business or a creator;</li>
            <li>the date and time you joined.</li>
          </ul>
          <p className="mt-3">
            Our server also uses your IP address for a few minutes to stop
            repeated signups from the same connection. It is kept in memory only
            and is not saved with your entry.
          </p>
        </section>

        <section>
          <h2>Why we collect it</h2>
          <p>
            To tell you when Pitchype opens, and to understand how many
            businesses and creators are interested. We don’t sell your details
            or use them for advertising.
          </p>
        </section>

        <section>
          <h2>Who handles it</h2>
          <p>
            The waitlist is stored with Supabase, our database provider, and the
            website is hosted by Vercel. They process the data on our behalf.
          </p>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <p>
            Until Pitchype launches and we’ve let you know, or until you ask us
            to remove it, whichever comes first.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            To see, correct or delete what we hold about you, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="link">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
