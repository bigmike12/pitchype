import {
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  ClipboardList,
  Clock,
  List,
  Megaphone,
  Plus,
  Search,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CampaignTable } from "@/components/campaigns/campaign-table";
import { ClayTile, type Tone } from "@/components/brand/stickers";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getApplicationCounts } from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { getWalletBalance } from "@/lib/db/money";
import {
  campaignAlerts,
  campaignCountsText,
  type CampaignAlert,
} from "@/lib/home";
import { formatNaira } from "@/lib/money";
import { greeting } from "@/lib/portal";

import { OverviewList, type OverviewRow } from "./overview-list";

const RECENT = 5;

/** A business's home: what needs attention, quick actions, recent campaigns. */
export async function BusinessHome({
  userId,
  contactName,
}: {
  userId: string;
  contactName: string;
}) {
  const [campaigns, counts, walletKobo] = await Promise.all([
    listOwnCampaigns(userId),
    getApplicationCounts(),
    getWalletBalance(userId, "business_wallet"),
  ]);
  const alerts = campaignAlerts(campaigns);

  const waitingPerCampaign = campaigns.map(
    (campaign) => counts.get(campaign.id)?.waiting ?? 0,
  );
  const waitingTotal = waitingPerCampaign.reduce((sum, n) => sum + n, 0);
  const campaignsWaiting = waitingPerCampaign.filter((n) => n > 0).length;
  const liveCount = campaigns.filter((c) => c.status === "open").length;

  const overview: OverviewRow[] = [
    {
      key: "applications",
      icon: ClipboardList,
      tone: "lilac",
      title: "Applications to review",
      detail:
        campaignsWaiting === 0
          ? "Nothing is waiting for you"
          : `Across ${campaignsWaiting} ${campaignsWaiting === 1 ? "campaign" : "campaigns"}`,
      value: String(waitingTotal),
      href: "/business/campaigns",
    },
    {
      key: "live",
      icon: Megaphone,
      tone: "mint",
      title: "Live campaigns",
      detail:
        liveCount === 0 ? "None open right now" : "Creators can see and apply",
      value: String(liveCount),
      href: "/business/campaigns",
    },
    {
      key: "wallet",
      icon: Wallet,
      tone: "sun",
      title: "Wallet balance",
      detail: "Refunds, used first when you pay for a hire",
      value: formatNaira(walletKobo),
      href: "/business/wallet",
    },
  ];

  return (
    <>
      <PageHeader
        title={greeting(contactName)}
        lead="Here’s where your campaigns stand."
      />

      {alerts.length > 0 && (
        <div className="mb-8 space-y-3">
          {alerts.map((alert) => (
            <AlertCallout key={alert.campaignId} alert={alert} />
          ))}
        </div>
      )}

      {/* One primary action, then the two others as compact rows: a
          hierarchy, not three equal tiles. */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Link
          href="/business/campaigns/new"
          className="group flex flex-col justify-between gap-8 rounded-panel p-6 panel motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:hover:-translate-y-px sm:p-8 lg:col-span-3"
        >
          <ClayTile icon={Plus} tone="sun" size="lg" />
          <span className="block">
            <span className="block text-display-md">Post a campaign</span>
            <span className="mt-2 block max-w-120 text-body">
              Say what to post and who can apply. See how many creators qualify
              first.
            </span>
          </span>
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            Start a campaign
            <ArrowRight
              aria-hidden="true"
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            />
          </span>
        </Link>

        <ul className="grid content-start gap-4 lg:col-span-2">
          <li>
            <QuickRow
              href="/business/creators"
              icon={Search}
              tone="lilac"
              title="Find creators"
            >
              Browse by niche, platform, followers, state and rate.
            </QuickRow>
          </li>
          <li>
            <QuickRow
              href="/business/campaigns"
              icon={List}
              tone="mint"
              title="Your campaigns"
            >
              {campaignCountsText(campaigns)}
            </QuickRow>
          </li>
        </ul>
      </div>

      <div className="mt-10">
        <OverviewList title="Where things stand" rows={overview} />
      </div>

      <section aria-labelledby="recent-title" className="mt-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="recent-title" className="text-display-md">
            Recent campaigns
          </h2>
          {campaigns.length > 0 && (
            <Link href="/business/campaigns" className="link text-sm">
              See all
            </Link>
          )}
        </div>
        {campaigns.length > 0 ? (
          <CampaignTable
            campaigns={campaigns.slice(0, RECENT)}
            counts={counts}
          />
        ) : (
          <EmptyState
            icon={Megaphone}
            tone="sun"
            title="Post your first campaign"
            action={
              <Link href="/business/campaigns/new" className={buttonVariants()}>
                <Plus aria-hidden="true" />
                New campaign
              </Link>
            }
          >
            Describe what you want creators to post and who can apply. You’ll
            see how many creators qualify before it goes live.
          </EmptyState>
        )}
      </section>
    </>
  );
}

/** A quick action as a compact row: one link, a clay tile, a short line. */
function QuickRow({
  href,
  icon,
  tone,
  title,
  children,
}: {
  href: string;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full items-center gap-4 rounded-card p-4 panel motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 hover:shadow-[0_0_0_1px_var(--color-hairline-strong),var(--shadow-lift)] motion-safe:hover:-translate-y-px sm:p-5"
    >
      <ClayTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm">{children}</span>
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function AlertCallout({ alert }: { alert: CampaignAlert }) {
  const view = (
    <Link href={`/business/campaigns/${alert.campaignId}`} className="link">
      View campaign
    </Link>
  );
  switch (alert.kind) {
    case "in_review":
      return (
        <Callout
          tone="attention"
          icon={Clock}
          title={`“${alert.title}” is being checked`}
          action={view}
        >
          We look at a business’s first campaign before it goes live, usually
          within a working day.
        </Callout>
      );
    case "sent_back":
      return (
        <Callout
          tone="attention"
          icon={Undo2}
          title={`“${alert.title}” was sent back`}
          action={view}
        >
          <p>Edit the draft, then submit it again.</p>
          <p className="mt-1">Our note: “{alert.note}”</p>
        </Callout>
      );
    case "taken_down":
      return (
        <Callout
          tone="danger"
          icon={CircleAlert}
          title={`“${alert.title}” was taken down`}
          action={view}
        >
          <p>Creators can no longer see it.</p>
          <p className="mt-1">The reason we gave: “{alert.note}”</p>
        </Callout>
      );
  }
}
