import { EyeOff, Globe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/shells/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
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

import { signOutAction } from "../../(app)/actions";
import { LoadingNotice } from "../../(app)/loading-notice";
import { AboutForm } from "./about-form";
import { setIndexingAction, setPublishedAction } from "./actions";
import { PhotoForm } from "./photo-form";
import { PlatformCard } from "./platform-card";

export const metadata: Metadata = { title: "Your public profile" };

export default function ProfilePage() {
  return (
    <AppShell signOutAction={signOutAction}>
      <Suspense fallback={<LoadingNotice>Loading your profile…</LoadingNotice>}>
        <ProfileEditor />
      </Suspense>
    </AppShell>
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
      <Link href="/account" className="link text-sm font-medium">
        Your account
      </Link>
      <h1 className="mt-4 text-display-lg">Your public profile</h1>
      <p className="mt-2 text-lg">
        This is what businesses see in the creator directory.
      </p>

      <Visibility profile={profile} />

      <section aria-labelledby="photo-title" className="mt-12">
        <h2 id="photo-title" className="mb-5 text-display-md">
          Photo
        </h2>
        <PhotoForm name={profile.displayName} photoUrl={profile.photoUrl} />
      </section>

      <section aria-labelledby="about-title" className="mt-12">
        <h2 id="about-title" className="mb-5 text-display-md">
          About you
        </h2>
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
      </section>

      <section aria-labelledby="platforms-title" className="mt-12">
        <h2 id="platforms-title" className="text-display-md">
          Platforms
        </h2>
        <p className="mt-2 mb-5 max-w-xl">
          Add each account you’d post on. Follower counts start as
          self-reported; verify an account to show the count we checked.
        </p>
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
      </section>
    </>
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
    <section
      aria-labelledby="visibility-title"
      className="mt-8 rounded-card bg-surface-card p-5 sm:p-6"
    >
      <h2 id="visibility-title" className="sr-only">
        Visibility
      </h2>

      {profile.hiddenReason ? (
        <div className="flex gap-3">
          <EyeOff
            className="mt-0.5 size-5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-ink">Hidden by Pitchype</p>
            <p className="mt-1">
              Your profile isn’t in the directory. The reason we gave: “
              {profile.hiddenReason}”. If you think this is a mistake, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="link">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Globe
            className={
              listed
                ? "mt-0.5 size-5 shrink-0 text-brand-green"
                : "mt-0.5 size-5 shrink-0 text-muted"
            }
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">
              {listed
                ? "Published: you’re in the directory"
                : profile.published
                  ? "Published, but not listed yet"
                  : "Draft: only you can see this"}
            </p>
            {problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
            </div>
          </div>
        </div>
      )}

      <form
        action={setIndexingAction}
        className="mt-5 flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between"
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
