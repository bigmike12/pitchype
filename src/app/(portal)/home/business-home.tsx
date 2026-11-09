import {
  CircleAlert,
  Clock,
  List,
  Megaphone,
  Plus,
  Search,
  Undo2,
} from "lucide-react";
import Link from "next/link";

import { CampaignTable } from "@/components/campaigns/campaign-table";
import { ActionCard } from "@/components/ui/action-card";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import {
  campaignAlerts,
  campaignCountsText,
  type CampaignAlert,
} from "@/lib/home";
import { greeting } from "@/lib/portal";

const RECENT = 5;

/** A business's home: what needs attention, quick actions, recent campaigns. */
export async function BusinessHome({
  userId,
  contactName,
}: {
  userId: string;
  contactName: string;
}) {
  const campaigns = await listOwnCampaigns(userId);
  const alerts = campaignAlerts(campaigns);

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

      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          href="/business/campaigns/new"
          icon={Plus}
          tone="sun"
          title="Post a campaign"
        >
          Say what to post and who can apply. See how many creators qualify
          first.
        </ActionCard>
        <ActionCard
          href="/business/creators"
          icon={Search}
          tone="lilac"
          title="Find creators"
        >
          Browse by niche, platform, followers, state and rate.
        </ActionCard>
        <ActionCard
          href="/business/campaigns"
          icon={List}
          tone="mint"
          title="Your campaigns"
        >
          {campaignCountsText(campaigns)}
        </ActionCard>
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
          <CampaignTable campaigns={campaigns.slice(0, RECENT)} />
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
