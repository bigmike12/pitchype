import type { Metadata } from "next";

import { ForBusinesses, ForCreators } from "@/components/landing/audiences";
import { CreatorsBand } from "@/components/landing/creators-band";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { GetStarted } from "@/components/landing/get-started";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { WhyPitchype } from "@/components/landing/why-pitchype";
import { SITE_NAME, SITE_URL, SOCIAL_PROFILES } from "@/lib/site";

// Set per page rather than in the root layout, so pages that don't set their
// own (sign-up, account) don't claim to be the home page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Name, URL and official profiles only: nothing about the company that isn't
// true yet. `sameAs` tells search engines these profiles belong to Pitchype.
const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  sameAs: SOCIAL_PROFILES.map((profile) => profile.url),
};

export default function HomePage() {
  return (
    <main id="main">
      <Hero />
      <CreatorsBand />
      <WhyPitchype />
      <ForCreators />
      <ForBusinesses />
      <HowItWorks />
      <Features />
      <Pricing />
      <Faq />
      <GetStarted />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organization).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
