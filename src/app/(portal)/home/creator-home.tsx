import {
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  EyeOff,
  Megaphone,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { setPublishedAction } from "@/app/(portal)/(influencer)/profile/actions";
import { CampaignCard } from "@/app/(portal)/(influencer)/campaigns/campaign-card";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { PlatformIcon } from "@/components/creators/platform-icon";
import { VerifiedMark } from "@/components/creators/platform-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import {
  FOLLOWER_RANGE_LABELS,
  PLATFORM_RULES,
  publishProblems,
  verificationView,
} from "@/lib/creator-profile";
import { listMyApplications } from "@/lib/db/applications";
import { listOpenCampaigns } from "@/lib/db/campaigns";
import {
  getOwnCreatorProfile,
  listNiches,
  type OwnCreatorProfile,
} from "@/lib/db/creators";
import { getCreatorWalletSummary, getWalletBalance } from "@/lib/db/money";
import { listOwnVerificationRequests } from "@/lib/db/verification";
import { creatorChecklist, jobsToStart } from "@/lib/home";
import { formatNaira } from "@/lib/money";
import { greeting } from "@/lib/portal";
import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

import { HomeGreeting, TaskList, type Task } from "./task-list";

const SHOWN_CAMPAIGNS = 3;

/**
 * A creator's home: the figures that matter to them (money first), what is
 * waiting on them, their profile as businesses see it, and campaigns they
 * qualify for. Every figure and task comes from their own records.
 */
export async function CreatorHome({ userId }: { userId: string }) {
  const [profile, requests, niches, open, applications, wallet, balanceKobo] =
    await Promise.all([
      getOwnCreatorProfile(userId),
      listOwnVerificationRequests(userId),
      listNiches(),
      listOpenCampaigns({ qualifiedOnly: true, page: 1 }),
      listMyApplications(),
      getCreatorWalletSummary(userId),
      getWalletBalance(userId, "creator_wallet"),
    ]);
  if (!profile) redirect("/onboarding");

  const waitingApplications = applications.filter(
    (a) => a.status === "submitted" || a.status === "shortlisted",
  ).length;
  // Our fee comes off what they earn, so the credit they see is after it.
  const earnedAfterFeeKobo = wallet.earnedKobo - wallet.feeKobo;

  const problems = publishProblems({
    niches: profile.niches,
    platformCount: profile.platforms.length,
  });
  const listed =
    profile.published && !profile.hiddenReason && problems.length === 0;
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const now = new Date();
  const platforms = profile.platforms.map((p) => ({
    ...p,
    verified: verificationView(requests, p.platform, p.handle, now).verified,
  }));
  const unverified = platforms.find((p) => !p.verified);
  const campaigns = open.campaigns.slice(0, SHOWN_CAMPAIGNS);
  const toStart = jobsToStart(applications);

  const tasks: Task[] = toStart.flatMap((a) =>
    a.engagement
      ? [
          {
            key: a.engagement.id,
            icon: BriefcaseBusiness,
            tone: "mint" as const,
            title: `Start work for ${a.campaign.businessName}`,
            detail: `${formatNaira(a.engagement.agreedPriceKobo)} is held by Pitchype for “${a.campaign.title}”.`,
            href: `/jobs/${a.engagement.id}`,
            action: "Open job",
            primary: true,
          },
        ]
      : [],
  );
  if (listed && unverified) {
    const label = PLATFORM_RULES[unverified.platform].label;
    tasks.push({
      key: "verify",
      icon: BadgeCheck,
      tone: "sky",
      title: `Verify your ${label} account`,
      detail: "Show the follower count we checked, not a self-reported range.",
      href: "/profile#platforms",
      action: "Verify",
    });
  }

  const lead = !listed
    ? "Finish your profile so businesses can find you."
    : toStart.length > 0
      ? `${toStart.length === 1 ? "A job is" : `${toStart.length} jobs are`} paid for and ready to start.`
      : open.total > 0
        ? `${open.total} open ${open.total === 1 ? "campaign fits" : "campaigns fit"} your profile.`
        : "Here’s what’s new for you.";

  return (
    <div className="space-y-6">
      <HomeGreeting
        title={greeting(profile.displayName)}
        lead={lead}
        actions={
          <Link href="/campaigns?qualified=1" className={buttonVariants()}>
            <Megaphone aria-hidden="true" />
            Find campaigns
          </Link>
        }
      />

      {profile.hiddenReason && (
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
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          emphasis
          label="Wallet balance"
          value={formatNaira(balanceKobo)}
          detail="Ready to pay out"
          icon={Wallet}
          tone="lilac"
          href="/wallet"
        />
        <StatCard
          label="Earned in total"
          value={formatNaira(earnedAfterFeeKobo)}
          detail="After our fee"
          icon={Banknote}
          tone="mint"
          href="/wallet"
        />
        <StatCard
          label="Applications waiting"
          value={String(waitingApplications)}
          detail={
            waitingApplications === 0
              ? "None waiting for a decision"
              : "Waiting for a business to decide"
          }
          icon={ClipboardList}
          tone="lilac"
          href="/applications"
        />
        <StatCard
          label="Campaigns you qualify for"
          value={String(open.total)}
          detail="Open now"
          icon={Megaphone}
          tone="sun"
          href="/campaigns?qualified=1"
        />
      </div>

      {!listed && !profile.hiddenReason && (
        <Checklist profile={profile} canPublish={problems.length === 0} />
      )}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <TaskList tasks={tasks} />

        <SectionCard
          id="profile-title"
          title="Your profile"
          aside={
            <>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold text-ink",
                  listed ? "bg-brand-mint" : "bg-surface-card",
                )}
              >
                {listed ? "Listed" : "Not listed"}
              </span>
              <Link href="/profile" className="link">
                Edit
              </Link>
            </>
          }
        >
          <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <CreatorPhoto
              name={profile.displayName}
              url={profile.photoUrl}
              sizes="56px"
              className="size-14 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">
                {profile.displayName}
              </p>
              <p className="text-[0.8125rem] text-muted">
                {[
                  profile.city,
                  profile.niches
                    .flatMap((slug) => nicheName.get(slug) ?? [])
                    .join(", "),
                  profile.startingRateKobo !== null &&
                    `from ${formatNaira(profile.startingRateKobo)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          {platforms.length > 0 && (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {platforms.map((p) => (
                <li
                  key={p.platform}
                  className="flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <PlatformIcon platform={p.platform} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {PLATFORM_RULES[p.platform].label}
                    </p>
                    <p className="text-[0.8125rem] text-muted">
                      {p.verified
                        ? `${p.verified.followerCount.toLocaleString("en-NG")} followers`
                        : `${FOLLOWER_RANGE_LABELS[p.followerRange]} followers, self-reported`}
                    </p>
                  </div>
                  {p.verified ? (
                    <VerifiedMark />
                  ) : (
                    <span className="text-xs font-medium text-muted">
                      Not verified
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <section aria-labelledby="campaigns-title">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="campaigns-title" className="text-display-md">
            Campaigns you qualify for
          </h2>
          {open.total > 0 && (
            <Link href="/campaigns?qualified=1" className="link text-sm">
              See all
            </Link>
          )}
        </div>
        {campaigns.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          >
            New campaigns appear here as businesses publish them. A complete
            profile qualifies you for more.
          </EmptyState>
        )}
      </section>
    </div>
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
      className="rounded-card panel p-5 sm:p-6"
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
