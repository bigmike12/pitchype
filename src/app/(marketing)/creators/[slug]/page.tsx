import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Chip } from "@/components/brand/fragments";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { PlatformDetails } from "@/components/creators/platform-list";
import { buttonVariants } from "@/components/ui/button";
import { PLATFORM_RULES, startingRateText } from "@/lib/creator-profile";
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
    <article className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-4">
        <CreatorPhoto
          name={creator.displayName}
          url={creator.photoUrl}
          sizes="(min-width: 1024px) 24rem, (min-width: 640px) 20rem, 90vw"
          priority
          className="max-w-80 lg:max-w-none"
        />
      </div>

      <div className="lg:col-span-8">
        <h1 className="text-display-lg">{creator.displayName}</h1>
        <p className="mt-2 flex items-center gap-1.5 text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {creator.city}, {stateLabel(creator.state)}
        </p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Niches">
          {niches.map((name) => (
            <li key={name}>
              <Chip className="px-3 py-1.5 text-sm">{name}</Chip>
            </li>
          ))}
        </ul>

        {creator.detailsVisible && (
          <dl className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Starting rate</dt>
              <dd className="mt-1 text-display-md">
                {startingRateText(creator.startingRateKobo)}
              </dd>
            </div>
            {creator.bio && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted">About</dt>
                <dd className="mt-1 max-w-[65ch] text-lg whitespace-pre-line">
                  {creator.bio}
                </dd>
              </div>
            )}
          </dl>
        )}

        <section aria-labelledby="platforms-title" className="mt-10">
          <h2 id="platforms-title" className="text-display-md">
            Platforms
          </h2>
          <div className="mt-4">
            <PlatformDetails platforms={creator.platforms} />
          </div>
        </section>

        {creator.detailsVisible ? (
          <p className="mt-8 rounded-card bg-surface-card p-5 text-ink">
            Messaging and hiring creators open soon. We’ll email you as soon as
            you can.
          </p>
        ) : (
          <aside className="mt-8 rounded-card bg-brand-sun p-5 sm:p-6">
            <h2 className="font-semibold text-ink">
              Want to work with {creator.displayName}?
            </h2>
            <p className="mt-1 text-ink">
              Businesses on Pitchype see their handles, bio and starting rate.
            </p>
            <Link
              href="/#waitlist"
              className={buttonVariants({ className: "mt-4" })}
            >
              Join the waitlist
            </Link>
          </aside>
        )}

        <div className="mt-10 max-w-xl">
          <ReportForm slug={creator.slug} />
        </div>
      </div>

      {creator.allowIndexing && <ProfileJsonLd creator={creator} />}
    </article>
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
