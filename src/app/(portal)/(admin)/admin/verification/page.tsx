import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PlatformIcon } from "@/components/creators/platform-icon";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { PLATFORM_RULES, formatDateTime } from "@/lib/creator-profile";
import {
  listVerificationQueue,
  type VerificationQueueItem,
} from "@/lib/db/verification";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";
import { ReviewForm } from "../review-form";

export const metadata: Metadata = { title: "Verification" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function VerificationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading verification requests…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Verification searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Verification({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [queue, query] = await Promise.all([
    listVerificationQueue(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Verification"
        lead="Creators asking for a Verified badge on a handle. Oldest first."
      />
      <QueueCard
        id="queue-title"
        title="Handles to verify"
        note="Open the profile, check the code is in the bio, and note the follower count you see."
        empty="Nothing waiting."
        paged={pageOf(queue, parsePage(query.page), QUEUE_PAGE_SIZE)}
        noun={["handle", "handles"]}
        hrefFor={(page) => pagedHref("/admin/verification", {}, page)}
      >
        {(item) => <VerificationItem key={item.id} item={item} />}
      </QueueCard>
    </>
  );
}

function VerificationItem({ item }: { item: VerificationQueueItem }) {
  const rules = PLATFORM_RULES[item.platform];
  return (
    <li className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={item.platform} className="mt-1 size-5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            <a
              href={rules.profileUrl(item.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="link break-all"
            >
              {rules.label}: @{item.handle}
              <span className="sr-only"> (opens {rules.label})</span>
            </a>
          </p>
          <p className="text-sm text-muted">
            {item.creator.slug ? (
              <Link href={`/creators/${item.creator.slug}`} className="link">
                {item.creator.displayName}
              </Link>
            ) : (
              item.creator.displayName
            )}
            , submitted {formatDateTime(item.submittedAt)}
          </p>
          <p className="mt-3 text-sm text-muted">Code to look for</p>
          <p className="text-xl font-semibold tracking-wide text-ink select-all">
            {item.code}
          </p>
        </div>
      </div>
      {item.verifiedElsewhere && (
        <p className="mt-4 flex gap-2 rounded-card bg-brand-sun p-3 text-sm text-ink">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            This handle is verified on another account,{" "}
            <strong>{item.verifiedElsewhere.displayName}</strong>. Verifying
            here removes their badge. Only do it if this code is in the bio now.
          </span>
        </p>
      )}
      <ReviewForm
        requestId={item.id}
        movesBadge={Boolean(item.verifiedElsewhere)}
      />
    </li>
  );
}
