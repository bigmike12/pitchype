import type { Metadata } from "next";

import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice (draft)",
  description:
    "How Pitchype handles the details you give us when you use the site, hire or work with creators.",
  alternates: { canonical: "/privacy" },
  // Unreviewed legal text shouldn't show up in search results.
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
      <p className="rounded-card bg-brand-sun px-5 py-4 font-semibold text-ink">
        Draft, to be reviewed by a lawyer before we rely on it. It describes how
        the product handles data today.
      </p>

      <h1 className="mt-10 text-display-lg">Privacy notice</h1>

      <div className="mt-8 space-y-8 text-lg [&_h2]:mb-3 [&_h2]:text-display-md [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <section>
          <h2>What we collect</h2>
          <p>When you use Pitchype, we store:</p>
          <ul className="mt-3">
            <li>
              your account details: name, email address and whether you joined
              as a business or a creator. Sign-in is handled by our
              authentication provider;
            </li>
            <li>
              your profile: display name, town and state, niches, platforms and
              handles, the follower range you give, any starting rate, bio and
              photo;
            </li>
            <li>
              your activity: campaigns, applications, chat messages, proof of
              work (links, screenshots and notes), disputes, reports and
              appeals;
            </li>
            <li>
              verification: the one-time code you put in your bio and the
              follower count an admin records when they check it;
            </li>
            <li>
              payments: payment references and amounts from our payment
              provider, Paystack. For creators who request a payout, we store
              the bank name, the last four digits of the account, the account
              name and a transfer recipient code, not the full account number;
            </li>
            <li>
              tracked links: when someone opens a creator’s link, the time, the
              link, the site or app it came from (the domain only), a keyed hash
              of the visitor and of their browser type, and the reason a visit
              wasn’t counted, if it wasn’t. This record doesn’t store the
              visitor’s IP address;
            </li>
          </ul>
          <p className="mt-3">
            When someone signs in, signs up or asks for a password reset, we
            record the network address of the request with the time, to limit
            repeated attempts. These records are kept in our database. A record
            is removed once its time window has passed, but only when that same
            address makes another attempt.
          </p>
          <p className="mt-3">
            We use cookies that keep you signed in. On our public pages, and
            only if you allow it, we also use Google Analytics (through Google
            Tag Manager) to count visits and see which pages people use. It sets
            its own cookies, and Google receives the pages you view and details
            of your browser and device. It doesn’t run once you sign in or sign
            up. You can change your choice at any time with “Cookie choices” at
            the bottom of the public pages.
          </p>
        </section>

        <section>
          <h2>Why we collect it</h2>
          <p>
            To run accounts and campaigns, match creators to campaigns, hold and
            release payments, pay out earnings, send the emails and in-app
            notifications you have chosen, and protect people on the platform,
            including by blocking contact details in chat and profiles. We also
            keep records of money that moved, so that payments and disputes can
            be checked.
          </p>
        </section>

        <section>
          <h2>Who handles it</h2>
          <p>
            Our providers process data on our behalf: Supabase for the database,
            sign-in and file storage; Vercel for hosting; Paystack for payments
            and payouts; Resend for email; and, if you allow it, Google for
            visitor statistics on our public pages. We don’t sell your details
            or use them for advertising.
          </p>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <p>
            We keep account and profile details while the account exists. We
            keep payment, ledger, payout and dispute records for as long as we
            need them to show what money moved and why. The exact period for
            those records is still being set and will be stated here before
            launch.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            You can change which emails you get in your account settings. To
            see, correct or ask us to delete what we hold about you, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="link">
              {CONTACT_EMAIL}
            </a>
            . We may keep records we are required to keep, such as payment and
            dispute records.
          </p>
        </section>
      </div>
    </main>
  );
}
