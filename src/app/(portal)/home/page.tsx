import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { BusinessHome } from "./business-home";
import { CreatorHome } from "./creator-home";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your home…">
          <div className="space-y-6">
            <HeaderSkeleton action />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((card) => (
                <div key={card} className="space-y-3 rounded-card p-4 panel">
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-7 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
            <div>
              <SectionTitleSkeleton />
              <TableSkeleton rows={3} />
            </div>
          </div>
        </PageLoading>
      }
    >
      <Home />
    </Suspense>
  );
}

// Where everyone lands after signing in. Admins have their own page, and
// anyone without a profile hasn't finished onboarding yet.
async function Home() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");
  const profile = await getProfile(user);
  if (!profile) redirect("/onboarding");

  return profile.role === "business" ? (
    <BusinessHome userId={user.id} contactName={profile.contactName} />
  ) : (
    <CreatorHome userId={user.id} />
  );
}
