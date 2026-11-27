import type { Metadata } from "next";
import Link from "next/link";

import {
  BUSINESS_FEE_BPS,
  INFLUENCER_FEE_BPS,
  MIN_FEE_KOBO,
  MIN_PAYOUT_KOBO,
  formatRate,
} from "@/lib/fees";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms (draft)",
  description: "Draft terms for using Pitchype as a business or a creator.",
  alternates: { canonical: "/terms" },
  // Unreviewed legal text shouldn't show up in search results.
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
      <p className="rounded-card bg-brand-sun px-5 py-4 font-semibold text-ink">
        Draft, to be reviewed by a lawyer before we rely on it. It describes how
        the product works today.
      </p>

      <h1 className="mt-10 text-display-lg">Terms</h1>

      <div className="mt-8 space-y-8 text-lg [&_h2]:mb-3 [&_h2]:text-display-md [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <section>
          <h2>What these terms cover</h2>
          <p>
            These terms apply when you use Pitchype, the marketplace that
            connects businesses with creators for paid campaigns, as a business
            or as a creator.
          </p>
        </section>

        <section>
          <h2>Accounts</h2>
          <ul>
            <li>
              Each account is either a business or a creator. You choose when
              you sign up, and you can’t change it later.
            </li>
            <li>
              Give accurate details. Our team’s accounts are set up by us, not
              through sign-up.
            </li>
          </ul>
        </section>

        <section>
          <h2>Campaigns and applications</h2>
          <ul>
            <li>
              A business’s first campaign is reviewed by our team before it goes
              live. Pay-per-click campaigns are reviewed before they go live
              too.
            </li>
            <li>
              On a fixed-price campaign, the price and requirements lock once
              the campaign is live. On a pay-per-click campaign, the rate, the
              budget, the destination and the tags lock when the campaign is
              submitted.
            </li>
            <li>
              Creators apply to campaigns they qualify for. Contact details are
              not allowed in briefs or profiles.
            </li>
          </ul>
        </section>

        <section>
          <h2>Hiring, submitting and approving work</h2>
          <ul>
            <li>
              After a business approves a creator, it has 48 hours to pay the
              agreed price and the service fee. If it doesn’t, the approval
              lapses.
            </li>
            <li>
              The agreed price is held for that hire until it is released or
              refunded under the rules below and on the escrow page.
            </li>
            <li>
              A creator presses Start work to confirm they are beginning, then
              submits proof of work. Once they have started, they can’t cancel
              on their own.
            </li>
            <li>
              The business has 7 days from each submission to accept it or
              decline it with written reasons. If it doesn’t reply within 7
              days, the money is released to the creator automatically. A
              creator can resubmit up to 3 times after a decline.
            </li>
            <li>
              Either side can open a dispute after a decline. Our team decides
              it, with a written reason, and the decision can release the money
              in full, refund it in full, or split it by amount.
            </li>
          </ul>
        </section>

        <section>
          <h2>Fees and payouts</h2>
          <ul>
            <li>
              Businesses pay a service fee of {formatRate(BUSINESS_FEE_BPS)} on
              top of the agreed price. Creators pay{" "}
              {formatRate(INFLUENCER_FEE_BPS)} of what they earn. Each fee is at
              least {formatNaira(MIN_FEE_KOBO)} per job.
            </li>
            <li>
              A creator can request a payout from their wallet, from{" "}
              {formatNaira(MIN_PAYOUT_KOBO)}. Our team approves each payout
              before it is sent. The bank transfer cost is passed on to the
              creator and shown before they confirm.
            </li>
          </ul>
        </section>

        <section>
          <h2>Cancellations and refunds</h2>
          <p>
            Refunds go to the business’s Pitchype wallet unless an admin refunds
            to the original payment method on request. The rules for each case
            are on the{" "}
            <Link href="/how-escrow-works" className="link">
              how escrow works
            </Link>{" "}
            page, and they apply to these terms.
          </p>
        </section>

        <section>
          <h2>Pay-per-click campaigns</h2>
          <ul>
            <li>
              Each approved creator gets one tracked link. A click counts when a
              person visits the business’s destination through it, before the
              deliver-by date. Link previews, automated visitors and clicks from
              blocked channels don’t count, and each person counts once per link
              in 24 hours.
            </li>
            <li>
              Creators must not change, hide or share their links in a way meant
              to inflate clicks. We may decline to count clicks that look
              artificial.
            </li>
            <li>
              Settlement happens once per hire, 72 hours after the click window
              closes. Unspent budget returns to the business’s wallet.
            </li>
          </ul>
        </section>

        <section>
          <h2>Conduct</h2>
          <ul>
            <li>
              Phone numbers, email addresses and WhatsApp or Telegram links are
              blocked. In chat, a message that contains them counts as a strike.
              Briefs and profiles with them are refused.
            </li>
            <li>
              One strike is a warning. Two stop new messages, applications and
              hires for 3 days. Three suspend the account until an admin reviews
              it. You can appeal once a day.
            </li>
            <li>
              A suspended account keeps the money it is owed. Running work,
              escrow and payouts carry on. It loses only new activity and its
              listings.
            </li>
            <li>
              Don’t misstate your followers, post content you have no right to
              post, or take a hire off Pitchype to avoid its protections.
            </li>
          </ul>
        </section>

        <section>
          <h2>Follower counts and verification</h2>
          <p>
            Follower counts are self-reported unless an admin has verified them,
            and each is labelled to show which it is.
          </p>
        </section>

        <section>
          <h2>Changes and contact</h2>
          <p>
            We may change these terms. For questions, email{" "}
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
