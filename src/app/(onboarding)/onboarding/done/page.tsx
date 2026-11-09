import { CircleAlert, Globe, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { CreatorCard } from "@/components/creators/creator-card";
import { ActionCard } from "@/components/ui/action-card";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { requireUser } from "@/lib/auth";
import {
  publishProblems,
  verificationView,
  type PlatformListing,
} from "@/lib/creator-profile";
import {
  getOwnCreatorProfile,
  listNiches,
  type OwnCreatorProfile,
} from "@/lib/db/creators";
import { getProfile } from "@/lib/db/profiles";
import { listOwnVerificationRequests } from "@/lib/db/verification";

import { publishFromOnboardingAction } from "../actions";
import { OnboardingStep, continueClass } from "../onboarding-step";

export const metadata: Metadata = { title: "You’re all set" };

const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? "";

export default function DonePage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading…</LoadingNotice>}>
      <Done />
    </Suspense>
  );
}

async function Done() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");
  const profile = await getProfile(user);
  if (!profile) redirect("/onboarding");

  if (profile.role === "influencer") return <CreatorDone userId={user.id} />;
  return (
    <OnboardingStep
      role="business"
      step="done"
      firstName={firstWord(profile.contactName)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/business/campaigns/new"
          icon={Plus}
          tone="sun"
          title="Post your first campaign"
        >
          Say what to post and who can apply.
        </ActionCard>
        <ActionCard
          href="/business/creators"
          icon={Search}
          tone="lilac"
          title="Find creators"
        >
          Browse by niche, platform, state and rate.
        </ActionCard>
      </div>
      <Link href="/home" className="link mt-8 inline-block">
        Go to your home
      </Link>
    </OnboardingStep>
  );
}

// A preview of the creator's directory card, what's still missing, and
// Publish or keep as a draft.
async function CreatorDone({ userId }: { userId: string }) {
  const [profile, niches, requests] = await Promise.all([
    getOwnCreatorProfile(userId),
    listNiches(),
    listOwnVerificationRequests(userId),
  ]);
  if (!profile) redirect("/onboarding");

  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const problems = publishProblems({
    niches: profile.niches,
    platformCount: profile.platforms.length,
  });

  return (
    <OnboardingStep
      role="influencer"
      step="done"
      firstName={firstWord(profile.displayName)}
    >
      <div className="max-w-xs">
        <CreatorCard
          href={null}
          displayName={profile.displayName}
          photoUrl={profile.photoUrl}
          city={profile.city}
          state={profile.state}
          nicheNames={profile.niches.flatMap((s) => nicheName.get(s) ?? [])}
          platforms={listings(profile, requests)}
        />
      </div>

      {profile.published ? (
        <Callout
          tone="success"
          icon={Globe}
          title="You’re in the directory"
          className="mt-8"
        >
          Businesses can find you now.
        </Callout>
      ) : (
        problems.length > 0 && (
          <Callout
            tone="attention"
            icon={CircleAlert}
            title="Before you can publish"
            className="mt-8"
          >
            <ul className="list-disc space-y-1 pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Callout>
        )
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {profile.published ? (
          <Link href="/home" className={continueClass}>
            Go to your home
          </Link>
        ) : (
          <>
            <form action={publishFromOnboardingAction}>
              <button
                type="submit"
                disabled={problems.length > 0}
                className={continueClass}
              >
                Publish my profile
              </button>
            </form>
            <Link
              href="/home"
              className={buttonVariants({
                variant: "secondary",
                size: "lg",
                className: "w-full sm:w-auto",
              })}
            >
              Keep it as a draft
            </Link>
          </>
        )}
      </div>
    </OnboardingStep>
  );
}

/** The card's platform lines, as businesses would see them. */
function listings(
  profile: OwnCreatorProfile,
  requests: Awaited<ReturnType<typeof listOwnVerificationRequests>>,
): PlatformListing[] {
  const now = new Date();
  return profile.platforms.map((p) => {
    const verified = verificationView(
      requests,
      p.platform,
      p.handle,
      now,
    ).verified;
    return {
      platform: p.platform,
      handle: null,
      followerRange: p.followerRange,
      followersUpdatedAt: p.followersUpdatedAt,
      verified: Boolean(verified),
      verifiedFollowerCount: verified?.followerCount ?? null,
      verifiedAt: verified?.verifiedAt ?? null,
    };
  });
}
