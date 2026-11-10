import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CreatorProfileView } from "@/components/creators/creator-profile-view";
import { buttonVariants } from "@/components/ui/button";
import { PLATFORM_RULES } from "@/lib/creator-profile";
import {
  getListedCreator,
  listNiches,
  type CreatorPage,
} from "@/lib/db/creators";
import { stateLabel } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";

import { ReportForm } from "./report-form";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const creator = await getListedCreator(slug);
  if (!creator) return { title: "Creator not found", robots: { index: false } };

  const niches = await nicheNames(creator);
  const platforms = creator.platforms
    .map((p) => PLATFORM_RULES[p.platform].label)
    .join(", ");
  const description = `${creator.displayName} is a ${niches.join(", ").toLowerCase()} creator in ${creator.city}, ${stateLabel(creator.state)}, on ${platforms}. See their profile on Pitchype.`;

  return {
    title: `${creator.displayName}, creator in ${creator.city}`,
    description,
    alternates: { canonical: `/creators/${creator.slug}` },
    robots: creator.allowIndexing ? undefined : { index: false, follow: false },
    openGraph: {
      title: creator.displayName,
      description,
      type: "profile",
      images: creator.photoUrl ? [{ url: creator.photoUrl }] : undefined,
    },
  };
}

export default function CreatorProfilePage({ params }: { params: Params }) {
  return (
    <main id="main" className="container-page py-10 lg:py-16">
      <Link href="/creators" className="link text-sm font-medium">
        All creators
      </Link>
      <Suspense
        fallback={
          <p role="status" aria-busy="true" className="mt-8 text-muted">
            Loading profile…
          </p>
        }
      >
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: { params: Params }) {
  const { slug } = await params;
  const creator = await getListedCreator(slug);
  if (!creator) notFound();
  const niches = await nicheNames(creator);

  return (
    <CreatorProfileView creator={creator} nicheNames={niches}>
      {creator.detailsVisible ? (
        <p className="mt-8 rounded-card bg-surface-card p-5 text-ink">
          Messaging and hiring creators open soon. We’ll email you as soon as
          you can.
        </p>
      ) : (
        <aside className="mt-8 rounded-card p-5 ring-1 ring-hairline aurora-warm sm:p-6">
          <h2 className="font-semibold text-ink">
            Want to work with {creator.displayName}?
          </h2>
          <p className="mt-1 text-ink">
            Businesses on Pitchype see their handles, bio and starting rate.
          </p>
          <Link
            href="/signup?role=business"
            className={buttonVariants({ className: "mt-4" })}
          >
            Create a business account
          </Link>
        </aside>
      )}

      <div className="mt-10 max-w-xl">
        <ReportForm slug={creator.slug} />
      </div>

      {creator.allowIndexing && <ProfileJsonLd creator={creator} />}
    </CreatorProfileView>
  );
}

async function nicheNames(creator: CreatorPage) {
  const niches = await listNiches();
  const name = new Map(niches.map((n) => [n.slug, n.name]));
  return creator.niches.flatMap((slug) => name.get(slug) ?? []);
}

// Public fields only, the same ones a signed-out visitor sees.
function ProfileJsonLd({ creator }: { creator: CreatorPage }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${SITE_URL}/creators/${creator.slug}`,
    dateModified: creator.updatedAt,
    mainEntity: {
      "@type": "Person",
      name: creator.displayName,
      image: creator.photoUrl ?? undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: creator.city,
        addressRegion: stateLabel(creator.state),
        addressCountry: "NG",
      },
    },
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify escapes quotes; "<" is escaped so a name can't close the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
