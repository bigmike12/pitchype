import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthHeading, AuthShell } from "@/components/shells/auth-shell";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { createProfileAction, signOutAction } from "../actions";
import { LoadingNotice } from "../loading-notice";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <AuthShell
      headerAction={
        <form action={signOutAction}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      }
    >
      <Suspense fallback={<LoadingNotice>Loading your account…</LoadingNotice>}>
        <Onboarding />
      </Suspense>
    </AuthShell>
  );
}

async function Onboarding() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/account");
  if (await getProfile(user)) redirect("/account");

  const isBusiness = user.role === "business";
  return (
    <>
      <AuthHeading
        title={
          isBusiness
            ? "Tell us about your business"
            : "Set up your creator profile"
        }
      >
        {isBusiness
          ? "Creators see this when you invite them or they apply to your campaigns."
          : "Businesses see this when you apply to their campaigns. You can add your platforms and audience later."}
      </AuthHeading>
      <ProfileForm
        role={user.role}
        action={createProfileAction}
        submitLabel="Save and continue"
        pendingLabel="Saving…"
      />
    </>
  );
}
