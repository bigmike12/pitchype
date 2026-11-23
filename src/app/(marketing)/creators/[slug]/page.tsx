import { PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CreatorProfileView } from "@/components/creators/creator-profile-view";
import { ProfileSkeleton } from "@/components/creators/profile-skeleton";
import { ShareProfileButton } from "@/components/creators/share-profile-button";
import { buttonVariants } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/auth";
import { PLATFORM_RULES } from "@/lib/creator-profile";
import {
  getCreatorPortfolio,
  getListedCreator,
  listNiches,
  type CreatorPage,
} from "@/lib/db/creators";
import { stateLabel } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";

import { ReportForm } from "./report-form";

type Params = Promise<{ slug: string }>;

// Search results show about 155 characters of a description.
const DESCRIPTION_LENGTH = 155;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const creator = await getListedCreator(slug);
  if (!creator) return { title: "Creator not found", robots: { index: false } };

  const niches = await nicheNames(creator);
  const title = `${creator.displayName}: ${niches[0] ? `${niches[0].toLowerCase()} creator` : "creator"} in ${creator.city}`;
  const description = describe(creator, niches);
  const url = `/creators/${creator.slug}`;

  // The image comes from opengraph-image.tsx next to this page. Sharing works
  // with indexing off: that only asks search engines to stay away.
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: creator.allowIndexing ? undefined : { index: false, follow: false },
    openGraph: { title, description, type: "profile", url },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** The bio, trimmed at a word, or a sentence made from the public facts. */
function describe(creator: CreatorPage, niches: string[]) {
  const bio = creator.bio?.replace(/\s+/g, " ").trim();
  if (bio) {
    if (bio.length <= DESCRIPTION_LENGTH) return bio;
    const cut = bio.slice(0, DESCRIPTION_LENGTH - 1);
    return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]$/, "")}…`;
  }
  const platforms = creator.platforms
    .map((p) => PLATFORM_RULES[p.platform].label)
    .join(", ");
  return `${creator.displayName} is a ${niches.join(", ").toLowerCase()} creator in ${creator.city}, ${stateLabel(creator.state)}, on ${platforms}. See their profile on Pitchype.`;
}

export default function CreatorProfilePage({ params }: { params: Params }) {
  return (
    <main id="main" className="container-page pt-6 pb-16 sm:pt-8 lg:pb-24">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/creators" className="link font-medium">
          All creators
        </Link>
      </nav>
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: { params: Params }) {
  const { slug } = await params;
  const creator = await getListedCreator(slug);
  if (!creator) notFound();
  const [niches, samples, viewer] = await Promise.all([
    nicheNames(creator),
    getCreatorPortfolio(creator.slug, creator.mediaKey),
    getSignedInUser(),
  ]);
  const first = creator.displayName.split(/\s+/)[0];
  const pageUrl = `${SITE_URL}/creators/${creator.slug}`;
  const isOwner = creator.isSelf;

  const share = <ShareProfileButton url={pageUrl} name={creator.displayName} />;
  let actions;
  let aside;
  if (isOwner) {
    actions = (
      <>
        {share}
        <Link href="/profile" className={buttonVariants()}>
          <PencilLine aria-hidden="true" />
          Edit your page
        </Link>
      </>
    );
  } else if (viewer?.role === "business") {
    actions = (
      <>
        {share}
        <Link
          href={`/business/creators/${creator.slug}`}
          className={buttonVariants()}
        >
          Message {first}
        </Link>
      </>
    );
  } else if (creator.detailsVisible) {
    // Admins: they see the details, and nothing to act on here.
    actions = share;
  } else {
    actions = (
      <>
        {share}
        <Link href="/signup?role=business" className={buttonVariants()}>
          Work with {first}
        </Link>
      </>
    );
    aside = (
      <div className="rounded-panel p-5 ring-1 ring-hairline aurora-warm">
        <h2 className="font-semibold text-ink">Hiring for your brand?</h2>
        <p className="mt-1.5 text-sm text-ink">
          With a business account you see {first}’s handles, the links to their
          posts and their starting rate, and can message them. You pay into
          escrow, and {first} is paid once you approve the work.
        </p>
        <Link
          href="/signup?role=business"
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "mt-4",
          })}
        >
          Create a business account
        </Link>
      </div>
    );
  }

  return (
    <>
      <CreatorProfileView
        creator={creator}
        nicheNames={niches}
        samples={samples}
        actions={actions}
        aside={aside}
      >
        <div className="max-w-xl">
          <ReportForm slug={creator.slug} />
        </div>
      </CreatorProfileView>
      {creator.allowIndexing && (
        <ProfileJsonLd creator={creator} niches={niches} />
      )}
    </>
  );
}

async function nicheNames(creator: CreatorPage) {
  const niches = await listNiches();
  const name = new Map(niches.map((n) => [n.slug, n.name]));
  return creator.niches.flatMap((slug) => name.get(slug) ?? []);
}

// Public fields only, the same ones a signed-out visitor sees, whoever is
// looking: no handles, so no sameAs links. Follower counts only where we
// verified them.
function ProfileJsonLd({
  creator,
  niches,
}: {
  creator: CreatorPage;
  niches: string[];
}) {
  const verified = creator.platforms.filter(
    (p) => p.verified && p.verifiedFollowerCount !== null,
  );
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${SITE_URL}/creators/${creator.slug}`,
    dateModified: creator.updatedAt,
    mainEntity: {
      "@type": "Person",
      name: creator.displayName,
      description: creator.bio ?? undefined,
      image: creator.photoUrl ?? undefined,
      knowsAbout: niches.length > 0 ? niches : undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: creator.city,
        addressRegion: stateLabel(creator.state),
        addressCountry: "NG",
      },
      interactionStatistic:
        verified.length > 0
          ? verified.map((p) => ({
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/FollowAction",
              userInteractionCount: p.verifiedFollowerCount,
              name: `${PLATFORM_RULES[p.platform].label} followers`,
            }))
          : undefined,
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
