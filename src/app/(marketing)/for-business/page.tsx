import type { Metadata } from "next";

import { AudienceCta } from "@/components/landing/audience-cta";
import { AudienceHero } from "@/components/landing/audience-hero";
import { AudienceWhy } from "@/components/landing/audience-why";
import { ForBusinesses } from "@/components/landing/audiences";
import { Faq } from "@/components/landing/faq";
import { BUSINESS_STEPS, StepList } from "@/components/landing/how-it-works";
import { BUSINESS_PAGE } from "@/lib/signup-link";

import {
  BUSINESS_FAQ,
  CostSection,
  HiringSection,
  MoneySection,
  WHY_ROWS,
} from "./sections";

export const metadata: Metadata = {
  title: "For businesses",
  description:
    "Find micro and nano creators in Nigeria, agree the price up front and pay through escrow. Pitchype holds your money until you approve the work.",
  alternates: { canonical: BUSINESS_PAGE },
};

const SIGN_UP = "/signup?role=business";

export default function ForBusinessPage() {
  return (
    <main id="main">
      <AudienceHero
        eyebrow="For businesses"
        title={
          <>
            Hire creators your customers{" "}
            <span className="text-gradient">already trust.</span>
          </>
        }
        lead="Find creators by niche, platform and city, agree the price up front and pay through escrow. Your money is held until you approve the work."
        primaryCta={{ href: SIGN_UP, label: "Create a business account" }}
        note="Free to join. A service fee applies only to jobs you fund."
      />

      <AudienceWhy
        id="why-business"
        title="Creator marketing without the guesswork"
        lead="Hiring creators usually means cold messages, prices that move and paying before you know what you’ll get. Here is what changes."
        rows={WHY_ROWS}
      />

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="container-page section-y"
      >
        <h2 id="how-it-works-title" className="text-display-lg reveal">
          How it works
        </h2>
        <p className="mt-4 mb-8 max-w-[36rem] text-lg reveal">
          Four steps from posting a campaign to approved work.
        </p>
        <StepList steps={BUSINESS_STEPS} />
      </section>

      <HiringSection />
      <MoneySection />
      <ForBusinesses />
      <CostSection />
      <Faq items={BUSINESS_FAQ} title="Questions from businesses" />

      <AudienceCta
        title={
          <>
            Ready to hire your{" "}
            <span className="text-gradient">first creator?</span>
          </>
        }
        text="Create a free business account, post a campaign, and pay only for work you approve."
        cta={{ href: SIGN_UP, label: "Create a business account" }}
      />
    </main>
  );
}
