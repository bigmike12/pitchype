import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";

import { Directory } from "@/components/creators/directory";
import { DirectorySkeleton } from "@/components/creators/directory-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/auth";

const DESCRIPTION =
  "Browse micro and nano creators across Nigeria by niche, platform, followers and state, with their work and honest follower counts.";

export const metadata: Metadata = {
  title: "Find Nigerian creators",
  description: DESCRIPTION,
  // Filtered views are the same page with fewer results.
  alternates: { canonical: "/creators" },
  openGraph: {
    title: "Find Nigerian creators on Pitchype",
    description: DESCRIPTION,
    url: "/creators",
  },
  twitter: { card: "summary_large_image" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CreatorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main
      id="main"
      className="container-page pt-10 pb-16 sm:pt-14 lg:pt-20 lg:pb-24"
    >
      <header className="max-w-4xl">
        <h1 className="max-w-[15ch] text-display-xl enter">
          Find Nigerian creators for your brand
        </h1>
        <p
          className="mt-5 max-w-[38rem] text-lg enter sm:text-xl"
          style={{ "--delay": "60ms" } as CSSProperties}
        >
          Micro and nano creators, with their work and their follower counts:
          self-reported, or verified when we’ve checked the account.
        </p>
      </header>
      <div className="mt-8 sm:mt-10">
        <Suspense fallback={<DirectorySkeleton />}>
          <PublicDirectory searchParams={searchParams} />
        </Suspense>
      </div>
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
    <aside className="mt-16 flex flex-col gap-5 rounded-frame p-6 ring-1 ring-hairline aurora-warm sm:flex-row sm:items-center sm:justify-between sm:p-10">
      <div>
        <h2 className="text-display-md">Hiring creators for your business?</h2>
        <p className="mt-2 max-w-xl text-ink">
          With a business account you see each creator’s handles, the links to
          their posts and their starting rate, filter by budget and message
          them.
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
