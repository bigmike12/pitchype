import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { LoadingNotice } from "../loading-notice";
import { BusinessHome } from "./business-home";
import { CreatorHome } from "./creator-home";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading your home…</LoadingNotice>}>
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
