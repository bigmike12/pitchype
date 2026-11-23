import type { Metadata } from "next";

import { AudienceSplit } from "@/components/landing/audience-split";
import { CreatorsBand } from "@/components/landing/creators-band";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { GetStarted } from "@/components/landing/get-started";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { WhyPitchype } from "@/components/landing/why-pitchype";
import { HOME_FAQ } from "@/lib/faq";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "@/lib/site";

// Set per page rather than in the root layout, so pages that don't set their
// own (sign-up, account) don't claim to be the home page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Only what's true and already on the page. The organisation is its name, URL
// and official profiles (`sameAs` tells search engines those profiles belong to
// Pitchype). The FAQ markup is the visible FAQ section's own questions.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      sameAs: SOCIAL_PROFILES.map((profile) => profile.url),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en-NG",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <main id="main">
      <Hero />
      <CreatorsBand />
      <WhyPitchype />
      <AudienceSplit />
      <HowItWorks />
      <Features />
      <Pricing />
      <Faq />
      <GetStarted />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
