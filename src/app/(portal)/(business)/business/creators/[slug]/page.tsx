import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReportForm } from "@/app/(marketing)/creators/[slug]/report-form";
import { CreatorProfileView } from "@/components/creators/creator-profile-view";
import { BlockControl } from "@/app/(portal)/account/block-control";
import { startConversationAction } from "@/app/(portal)/inbox/actions";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { ProfileSkeleton } from "@/components/creators/profile-skeleton";
import { ShareProfileButton } from "@/components/creators/share-profile-button";
import {
  getCreatorPortfolio,
  getListedCreator,
  listNiches,
} from "@/lib/db/creators";
import { listMyBlocks } from "@/lib/db/moderation";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Creator" };

type Params = Promise<{ slug: string }>;

export default function BusinessCreatorPage({ params }: { params: Params }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link
          href="/business/creators"
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Find creators
        </Link>
      </nav>
      <Suspense fallback={<ProfileSkeleton />}>
        <Creator params={params} />
      </Suspense>
    </>
  );
}

async function Creator({ params }: { params: Params }) {
  await requireRole("business");
  const { slug } = await params;
  const [creator, niches, blocks] = await Promise.all([
    getListedCreator(slug),
    listNiches(),
    listMyBlocks(),
  ]);
  if (!creator) notFound();
  // Businesses always get the user id (they message and block by it).
  const creatorId = creator.userId;
  if (!creatorId) notFound();
  const samples = await getCreatorPortfolio(creator.slug, creator.mediaKey);
  const blockedByMe = blocks.some((b) => b.id === creatorId);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));

  return (
    <CreatorProfileView
      creator={creator}
      nicheNames={creator.niches.flatMap((s) => nicheName.get(s) ?? [])}
      samples={samples}
      inPortal
      actions={
        <>
          <ShareProfileButton
            url={`${SITE_URL}/creators/${creator.slug}`}
            name={creator.displayName}
            label="Share"
          />
          {!blockedByMe && (
            <form action={startConversationAction}>
              <input type="hidden" name="creatorId" value={creatorId} />
              <Button type="submit">
                <MessageCircle aria-hidden="true" />
                Message {creator.displayName.split(/\s+/)[0]}
              </Button>
            </form>
          )}
        </>
      }
      aside={
        <div className="rounded-panel p-5 panel">
          <p className="text-sm text-body">
            To hire them, post a campaign they can apply to, or message them
            first.
          </p>
          <div className="mt-3">
            <BlockControl
              otherId={creatorId}
              otherName={creator.displayName}
              blockedByMe={blockedByMe}
            />
          </div>
        </div>
      }
    >
      <div className="max-w-xl">
        <ReportForm slug={creator.slug} />
      </div>
    </CreatorProfileView>
  );
}
