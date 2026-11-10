import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Directory } from "@/components/creators/directory";
import { buttonVariants } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Find Nigerian creators",
  description:
    "Browse micro and nano creators across Nigeria by niche, platform, followers and state. Follower counts are labelled self-reported or verified.",
  // Filtered views are the same page with fewer results.
  alternates: { canonical: "/creators" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CreatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main id="main" className="container-page py-12 lg:py-16">
      <h1 className="text-display-lg">Find creators</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Micro and nano creators across Nigeria. Follower counts are marked
        self-reported, or verified when we’ve checked the account.
      </p>
      <Suspense fallback={<DirectoryLoading />}>
        <PublicDirectory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PublicDirectory({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const viewer = await getSignedInUser();
  return (
    <>
      <Directory
        searchParams={searchParams}
        basePath="/creators"
        viewer={viewer}
      />
      {!viewer && <BusinessPrompt />}
    </>
  );
}

// Signed-out visitors: the reason to sign up as a business.
function BusinessPrompt() {
  return (
    <aside className="mt-16 flex flex-col gap-5 rounded-panel p-6 ring-1 ring-hairline aurora-warm sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div>
        <h2 className="text-display-md">Hiring creators for your business?</h2>
        <p className="mt-2 max-w-xl text-ink">
          Businesses on Pitchype see each creator’s handles, bio and starting
          rate, and can filter by budget.
        </p>
      </div>
      <Link
        href="/signup?role=business"
        className={buttonVariants({ size: "lg" })}
      >
        Create a business account
      </Link>
    </aside>
  );
}

function DirectoryLoading() {
  return (
    <p role="status" aria-busy="true" className="mt-8 text-muted">
      Loading creators…
    </p>
  );
}
