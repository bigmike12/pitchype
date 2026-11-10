import { EyeOff, Globe, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  PLATFORMS,
  publishProblems,
  verificationView,
} from "@/lib/creator-profile";
import {
  getOwnCreatorProfile,
  listNiches,
  type OwnCreatorProfile,
} from "@/lib/db/creators";
import { listOwnVerificationRequests } from "@/lib/db/verification";
import { KOBO_PER_NAIRA } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import { AboutForm } from "./about-form";
import { setIndexingAction, setPublishedAction } from "./actions";
import { PhotoForm } from "./photo-form";
import { PlatformCard } from "./platform-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Your public profile" };

export default function ProfilePage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your profile…">
            <HeaderSkeleton />
            <div className="space-y-4">
              <PanelSkeleton lines={2} />
              <PanelSkeleton lines={4} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <ProfileEditor />
      </Suspense>
    </div>
  );
}

async function ProfileEditor() {
  const user = await requireRole("influencer");
  const [profile, requests, niches] = await Promise.all([
    getOwnCreatorProfile(user.id),
    listOwnVerificationRequests(user.id),
    listNiches(),
  ]);
  if (!profile) redirect("/onboarding");
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Your public profile"
        lead="This is what businesses see in the creator directory."
      />

      <Visibility profile={profile} />

      <div className="mt-8 space-y-6">
        <Section id="photo" title="Photo">
          <PhotoForm name={profile.displayName} photoUrl={profile.photoUrl} />
        </Section>

        <Section id="about" title="About you">
          <AboutForm
            niches={niches}
            initial={{
              displayName: profile.displayName,
              bio: profile.bio ?? "",
              niches: profile.niches.join(","),
              state: profile.state,
              city: profile.city,
              startingRate: profile.startingRateKobo
                ? (profile.startingRateKobo / KOBO_PER_NAIRA).toLocaleString(
                    "en-NG",
                  )
                : "",
            }}
          />
        </Section>

        <Section
          id="platforms"
          title="Platforms"
          lead="Add each account you’d post on. Follower counts start as self-reported; verify an account to show the count we checked."
        >
          <ul className="space-y-4">
            {PLATFORMS.map((platform) => {
              const saved =
                profile.platforms.find((p) => p.platform === platform) ?? null;
              return (
                <PlatformCard
                  key={platform}
                  platform={platform}
                  saved={saved}
                  verification={
                    saved
                      ? verificationView(requests, platform, saved.handle, now)
                      : null
                  }
                />
              );
            })}
          </ul>
        </Section>
      </div>
    </>
  );
}

/** One part of the editor; `id` is the anchor the home checklist links to. */
function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-card panel p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-display-md">
        {title}
      </h2>
      {lead && <p className="mt-2 max-w-xl">{lead}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Visibility({ profile }: { profile: OwnCreatorProfile }) {
  const problems = publishProblems({
    niches: profile.niches,
    platformCount: profile.platforms.length,
  });
  const listed =
    profile.published && !profile.hiddenReason && problems.length === 0;

  return (
    <section aria-label="Visibility" className="space-y-3">
      {profile.hiddenReason ? (
        <Callout tone="danger" icon={EyeOff} title="Hidden by Pitchype">
          <p>
            Your profile isn’t in the directory. If you think this is a mistake,
            email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="link">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <p className="mt-1">The reason we gave: “{profile.hiddenReason}”</p>
        </Callout>
      ) : (
        <Callout
          tone={listed ? "success" : "info"}
          icon={listed ? Globe : PencilLine}
          title={
            listed
              ? "Published: you’re in the directory"
              : profile.published
                ? "Published, but not listed yet"
                : "Draft: only you can see this"
          }
          action={
            <>
              <form action={setPublishedAction}>
                <input
                  type="hidden"
                  name="published"
                  value={profile.published ? "false" : "true"}
                />
                <Button
                  type="submit"
                  variant={profile.published ? "secondary" : "default"}
                  disabled={!profile.published && problems.length > 0}
                >
                  {profile.published
                    ? "Move back to drafts"
                    : "Publish profile"}
                </Button>
              </form>
              {listed && profile.slug && (
                <Link
                  href={`/creators/${profile.slug}`}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  View your page
                </Link>
              )}
            </>
          }
        >
          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}

      <form
        action={setIndexingAction}
        className="flex flex-col gap-3 rounded-card panel p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <p className="text-sm">
          {profile.allowIndexing
            ? "Search engines like Google can show your page."
            : "Your page is hidden from search engines. People can still find it in the directory."}
        </p>
        <input
          type="hidden"
          name="allowIndexing"
          value={profile.allowIndexing ? "false" : "true"}
        />
        <Button type="submit" variant="secondary">
          {profile.allowIndexing
            ? "Hide from search engines"
            : "Show in search engines"}
        </Button>
      </form>
    </section>
  );
}
