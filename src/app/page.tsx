import { Audiences } from "@/components/landing/audiences";
import { CreatorsBand } from "@/components/landing/creators-band";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { Waitlist } from "@/components/landing/waitlist";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Name and URL only: nothing about the company that isn't true yet.
const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
};

export default function HomePage() {
  return (
    <main id="main">
      <Hero />
      <CreatorsBand />
      <HowItWorks />
      <Features />
      <Audiences />
      <Pricing />
      <Faq />
      <Waitlist />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organization).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
