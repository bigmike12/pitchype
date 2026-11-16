import type { Metadata } from "next";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { listHiddenCreators } from "@/lib/db/reports";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { unhideCreatorAction } from "../actions";
import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";

export const metadata: Metadata = { title: "Hidden profiles" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function HiddenProfilesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading hidden profiles…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <HiddenProfiles searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HiddenProfiles({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("admin");
  const [hidden, query] = await Promise.all([
    listHiddenCreators(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        title="Hidden profiles"
        lead="Creator profiles an admin took out of the directory, with the reason the creator was given."
      />
      <QueueCard
        id="hidden-title"
        title="Hidden from the directory"
        empty="None."
        paged={pageOf(hidden, parsePage(query.page), QUEUE_PAGE_SIZE)}
        noun={["profile", "profiles"]}
        hrefFor={(page) => pagedHref("/admin/hidden", {}, page)}
      >
        {(creator) => (
          <li
            key={creator.userId}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div>
              <p className="font-semibold text-ink">{creator.displayName}</p>
              <p className="text-sm text-muted">
                “{creator.reason}”, {formatDateTime(creator.hiddenAt)}
              </p>
            </div>
            <form action={unhideCreatorAction}>
              <input type="hidden" name="creatorId" value={creator.userId} />
              <Button type="submit" variant="secondary">
                Show again
              </Button>
            </form>
          </li>
        )}
      </QueueCard>
    </>
  );
}
