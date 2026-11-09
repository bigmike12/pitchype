import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { Directory } from "@/components/creators/directory";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Find creators" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The creator directory inside the business portal: same filters and
// results as the public /creators, with every link staying in the app.
export default function BusinessCreatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <PageHeader
        title="Find creators"
        lead="Micro and nano creators across Nigeria. Follower counts are marked self-reported, or verified when we’ve checked the account."
      />
      <Suspense fallback={<LoadingNotice>Loading creators…</LoadingNotice>}>
        <Creators searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Creators({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("business");
  return (
    <Directory
      searchParams={searchParams}
      basePath="/business/creators"
      viewer={user}
    />
  );
}
