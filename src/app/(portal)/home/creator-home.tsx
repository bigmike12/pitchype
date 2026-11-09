import { BadgeCheck, Check, EyeOff, Globe, Megaphone } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { setPublishedAction } from "@/app/(portal)/(influencer)/profile/actions";
import { CampaignCard } from "@/app/(portal)/(influencer)/campaigns/campaign-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  PLATFORM_RULES,
  publishProblems,
  verificationView,
} from "@/lib/creator-profile";
import { listOpenCampaigns } from "@/lib/db/campaigns";
import {
  getOwnCreatorProfile,
  listNiches,
  type OwnCreatorProfile,
} from "@/lib/db/creators";
import { listOwnVerificationRequests } from "@/lib/db/verification";
import { creatorChecklist } from "@/lib/home";
import { greeting } from "@/lib/portal";
import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

const SHOWN_CAMPAIGNS = 3;

/** A creator's home: where their profile stands, and campaigns they fit. */
export async function CreatorHome({ userId }: { userId: string }) {
  const [profile, requests, niches, open] = await Promise.all([
    getOwnCreatorProfile(userId),
    listOwnVerificationRequests(userId),
    listNiches(),
    listOpenCampaigns({ qualifiedOnly: true, page: 1 }),
  ]);
  if (!profile) redirect("/onboarding");

  const problems = publishProblems({
    niches: profile.niches,
    platformCount: profile.platforms.length,
  });
  const listed =
    profile.published && !profile.hiddenReason && problems.length === 0;
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const now = new Date();
  const unverified = profile.platforms.find(
    (p) => !verificationView(requests, p.platform, p.handle, now).verified,
  );
  const campaigns = open.campaigns.slice(0, SHOWN_CAMPAIGNS);

  return (
    <>
      <PageHeader
        title={greeting(profile.displayName)}
        lead={
          listed
            ? "Here’s what’s new for you."
            : "Finish your profile so businesses can find you."
        }
      />

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
      ) : listed ? (
        <div className="space-y-3">
          <Callout
            tone="success"
            icon={Globe}
            title="You’re in the directory"
            action={
              profile.slug && (
                <Link href={`/creators/${profile.slug}`} className="link">
                  View your page
                </Link>
              )
            }
          >
            Businesses can find you and see your platforms.
          </Callout>
          {unverified && (
            <Callout
              tone="info"
              icon={BadgeCheck}
              title={`Verify your ${PLATFORM_RULES[unverified.platform].label} account`}
              action={
                <Link href="/profile#platforms" className="link">
                  Verify on your profile
                </Link>
              }
            >
              Show businesses the follower count we checked, instead of a
              self-reported range.
            </Callout>
          )}
        </div>
      ) : (
        <Checklist profile={profile} canPublish={problems.length === 0} />
      )}

      <section aria-labelledby="campaigns-title" className="mt-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="campaigns-title" className="text-display-md">
            Campaigns you qualify for
          </h2>
          <Link href="/campaigns?qualified=1" className="link text-sm">
            See all
          </Link>
        </div>
        {campaigns.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="grid">
                <CampaignCard
                  campaign={campaign}
                  nicheNames={campaign.niches.flatMap(
                    (s) => nicheName.get(s) ?? [],
                  )}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Megaphone}
            tone="lilac"
            title="No campaigns for you yet"
            action={
              <Link
                href="/profile"
                className={buttonVariants({ variant: "secondary" })}
              >
                Edit your profile
              </Link>
            }
          >
            New campaigns appear here as businesses publish them. A complete
            profile qualifies you for more.
          </EmptyState>
        )}
      </section>
    </>
  );
}

function Checklist({
  profile,
  canPublish,
}: {
  profile: OwnCreatorProfile;
  canPublish: boolean;
}) {
  const items = creatorChecklist({
    niches: profile.niches,
    platformCount: profile.platforms.length,
    hasPhoto: profile.photoUrl !== null,
    bio: profile.bio,
    startingRateKobo: profile.startingRateKobo,
    published: profile.published,
  });
  const done = items.filter((i) => i.done).length;

  return (
    <section
      aria-labelledby="checklist-title"
      className="rounded-card bg-white p-5 ring-1 ring-hairline sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checklist-title" className="font-semibold text-ink">
          Get listed in the directory
        </h2>
        <p className="text-sm text-muted">
          {done} of {items.length} done
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-card"
      >
        <div
          className="h-full rounded-full bg-brand-green"
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <ul className="mt-4 divide-y divide-hairline">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex min-h-12 items-center gap-3 py-2",
              item.done && "max-sm:hidden",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2",
                item.done ? "border-ink bg-ink text-white" : "border-field",
              )}
            >
              {item.done && <Check className="size-3.5" aria-hidden="true" />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1",
                item.done ? "text-muted line-through" : "text-ink",
              )}
            >
              {item.label}
              {item.done && <span className="sr-only"> (done)</span>}
            </span>
            {!item.done &&
              (item.href ? (
                <Link href={item.href} className="link text-sm">
                  Add<span className="sr-only">: {item.label}</span>
                </Link>
              ) : (
                <form action={setPublishedAction}>
                  <input type="hidden" name="published" value="true" />
                  <Button type="submit" disabled={!canPublish}>
                    Publish
                  </Button>
                </form>
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
