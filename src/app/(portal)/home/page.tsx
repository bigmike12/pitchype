import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { BusinessHome } from "./business-home";
import { CreatorHome } from "./creator-home";
import {
  CardGridSkeleton,
  HeaderSkeleton,
  PageLoading,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <PageLoading label="Loading your home…">
          <HeaderSkeleton />
          <CardGridSkeleton variant="action" count={3} />
          <div className="mt-12">
            <SectionTitleSkeleton />
            <TableSkeleton rows={3} />
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
