import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";
import { greeting } from "@/lib/portal";

import { LoadingNotice } from "../loading-notice";

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

  const name =
    profile.role === "business" ? profile.contactName : profile.displayName;
  return <PageHeader title={greeting(name)} />;
}
