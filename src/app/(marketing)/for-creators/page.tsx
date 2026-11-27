import type { Metadata } from "next";

import { AudienceCta } from "@/components/landing/audience-cta";
import { AudienceHero } from "@/components/landing/audience-hero";
import { AudienceWhy } from "@/components/landing/audience-why";
import { ForCreators } from "@/components/landing/audiences";
import { Faq } from "@/components/landing/faq";
import { CREATOR_STEPS, StepList } from "@/components/landing/how-it-works";
import { CREATOR_PAGE } from "@/lib/signup-link";

import {
  CREATOR_FAQ,
  CostSection,
  FindWorkSection,
  GetPaidSection,
  WHY_ROWS,
} from "./sections";

export const metadata: Metadata = {
  title: "Paid brand collaborations for creators",
  description:
    "Apply to paid campaigns from businesses, agree your price and start once the money is in escrow. No follower minimum to join Pitchype.",
  alternates: { canonical: CREATOR_PAGE },
};

const SIGN_UP = "/signup?role=influencer";

export default function ForCreatorsPage() {
  return (
    <main id="main">
      <AudienceHero
        eyebrow="For creators"
        title={
          <>
            Paid brand collaborations,{" "}
            <span className="text-gradient">whatever your follower count.</span>
          </>
        }
        lead="Apply to paid campaigns from businesses, agree your price, and start once the money is in escrow. There’s no follower minimum to join."
        primaryCta={{ href: SIGN_UP, label: "Create a creator account" }}
        note="Free to join. Our fee only applies when you’re paid."
      />

      <AudienceWhy
        id="why-creators"
        title="Followers aren’t a paycheck. Here’s the difference."
        lead="Platforms help you build an audience. They don’t promise you’ll be paid for the work. Here is what changes on Pitchype."
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
          Four steps from setting up your profile to money in your wallet.
        </p>
        <StepList steps={CREATOR_STEPS} />
      </section>

      <FindWorkSection />
      <GetPaidSection />
      <ForCreators />
      <CostSection />
      <Faq items={CREATOR_FAQ} title="Questions from creators" />

      <AudienceCta
        title={
          <>
            Ready to get paid for{" "}
            <span className="text-gradient">your content?</span>
          </>
        }
        text="Create a free creator account, find a campaign that fits, and get paid through escrow once your work is approved."
        cta={{ href: SIGN_UP, label: "Create a creator account" }}
      />
    </main>
  );
}
