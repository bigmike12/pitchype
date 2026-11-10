import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReportForm } from "@/app/(marketing)/creators/[slug]/report-form";
import { CreatorProfileView } from "@/components/creators/creator-profile-view";
import { Callout } from "@/components/ui/callout";
import { requireRole } from "@/lib/auth";
import { getListedCreator, listNiches } from "@/lib/db/creators";
import { PageLoading, PanelSkeleton, Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Creator" };

type Params = Promise<{ slug: string }>;

export default function BusinessCreatorPage({ params }: { params: Params }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link
          href="/business/creators"
          className="font-medium text-ink underline-offset-4 hover:underline"
        >
          Find creators
        </Link>
      </nav>
      <Suspense
        fallback={
          <PageLoading label="Loading profile…">
            <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
              <Skeleton className="aspect-square w-full max-w-80 rounded-card lg:col-span-4 lg:max-w-none" />
              <div className="lg:col-span-8">
                <Skeleton className="h-11 w-2/3 rounded-xl" />
                <Skeleton className="mt-3 h-5 w-1/3" />
                <PanelSkeleton lines={4} className="mt-8" />
                <PanelSkeleton lines={2} className="mt-4" />
              </div>
            </div>
          </PageLoading>
        }
      >
        <Creator params={params} />
      </Suspense>
    </>
  );
}

async function Creator({ params }: { params: Params }) {
  await requireRole("business");
  const { slug } = await params;
  const [creator, niches] = await Promise.all([
    getListedCreator(slug),
    listNiches(),
  ]);
  if (!creator) notFound();
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));

  return (
    <CreatorProfileView
      creator={creator}
      nicheNames={creator.niches.flatMap((s) => nicheName.get(s) ?? [])}
    >
      <Callout
        tone="info"
        icon={MessageCircle}
        title="Messaging and hiring open soon"
        className="mt-8"
      >
        We’ll email you as soon as you can contact and hire creators.
      </Callout>
      <div className="mt-10 max-w-xl">
        <ReportForm slug={creator.slug} />
      </div>
    </CreatorProfileView>
  );
}
