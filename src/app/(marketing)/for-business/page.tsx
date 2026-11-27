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
  CampaignTypesSection,
  CostSection,
  HiringSection,
  MoneySection,
  WHY_ROWS,
} from "./sections";

export const metadata: Metadata = {
  title: "Hire creators for paid campaigns",
  description:
    "Find micro and nano creators, agree the price up front and pay through escrow. Pitchype holds your money until you accept the work or 7 days pass.",
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
            Hire micro creators,{" "}
            <span className="text-gradient">with the money in escrow.</span>
          </>
        }
        lead="Find creators by niche, platform, location and followers, agree the price up front and pay through escrow. Your money stays held until you accept the work or 7 days pass."
        primaryCta={{ href: SIGN_UP, label: "Create a business account" }}
        note="Free to join. A service fee applies only to jobs you fund."
      />

      <AudienceWhy
        id="why-business"
        title="Hiring creators without the guesswork"
        lead="Hiring creators usually means cold messages, prices that move and paying before you know what you’ll get. Here is what changes on Pitchype."
        rows={WHY_ROWS}
      />

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="container-page section-y"
      >
        <h2 id="how-it-works-title" className="text-display-lg">
          How it works
        </h2>
        <p className="mt-4 mb-8 max-w-[36rem] text-lg">
          Four steps from a campaign or a creator’s profile to approved work.
        </p>
        <StepList steps={BUSINESS_STEPS} />
      </section>

      <HiringSection />
      <CampaignTypesSection />
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
        text="Create a free business account, post a campaign or find creators, and pay through escrow."
        cta={{ href: SIGN_UP, label: "Create a business account" }}
      />
    </main>
  );
}
