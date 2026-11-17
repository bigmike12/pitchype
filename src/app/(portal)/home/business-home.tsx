import {
  CircleAlert,
  Clock,
  CreditCard,
  Megaphone,
  Plus,
  Search,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CampaignTable } from "@/components/campaigns/campaign-table";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/creator-profile";
import { getApplicationCounts, listMyHires } from "@/lib/db/applications";
import { listOwnCampaigns } from "@/lib/db/campaigns";
import { getWalletBalance } from "@/lib/db/money";
import { campaignAlerts, hirePipeline, type CampaignAlert } from "@/lib/home";
import { formatNaira } from "@/lib/money";
import { greeting } from "@/lib/portal";
import { cn } from "@/lib/utils";

import { HomeGreeting, TaskList, type Task } from "./task-list";

const RECENT = 5;
const SHOWN_TO_PAY = 3;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A business's home: its hiring pipeline (to review, to pay, in progress,
 * completed), what is waiting on it, its wallet and its recent campaigns.
 * Every figure and task comes from its own records.
 */
export async function BusinessHome({
  userId,
  contactName,
}: {
  userId: string;
  contactName: string;
}) {
  const [campaigns, counts, walletKobo, hires] = await Promise.all([
    listOwnCampaigns(userId),
    getApplicationCounts(),
    getWalletBalance(userId, "business_wallet"),
    listMyHires(userId),
  ]);
  const alerts = campaignAlerts(campaigns);
  const pipeline = hirePipeline(hires, new Date());

  // Reviewing happens on the hiring board, across campaigns.
  const waiting = campaigns
    .map((c) => ({ id: c.id, waiting: counts.get(c.id)?.waiting ?? 0 }))
    .filter((c) => c.waiting > 0)
    .sort((a, b) => b.waiting - a.waiting);
  const waitingTotal = waiting.reduce((sum, c) => sum + c.waiting, 0);
  const reviewHref = "/business/board";
  const liveCount = campaigns.filter((c) => c.status === "open").length;

  const tasks: Task[] = pipeline.toPay.slice(0, SHOWN_TO_PAY).map((hire) => ({
    key: hire.id,
    icon: CreditCard,
    tone: "peach",
    title: `Pay for your hire on “${hire.campaignTitle}”`,
    detail: `${formatNaira(hire.agreedPriceKobo)} plus our fee. Pay by ${formatDateTime(hire.payBy)}, or the hire lapses.`,
    href: `/business/engagements/${hire.id}/pay`,
    action: "Pay",
    primary: true,
  }));
  if (waitingTotal > 0) {
    tasks.push({
      key: "review",
      icon: Users,
      tone: "lilac",
      title: `${plural(waitingTotal, "application", "applications")} to review`,
      detail: `Across ${plural(waiting.length, "campaign", "campaigns")}`,
      href: reviewHref,
      action: "Review",
      primary: pipeline.toPay.length === 0,
    });
  }

  const leadParts = [
    waitingTotal > 0 &&
      `${plural(waitingTotal, "application is", "applications are")} waiting`,
    pipeline.toPay.length > 0 &&
      `${plural(pipeline.toPay.length, "hire needs", "hires need")} paying`,
  ].filter(Boolean);
  const lead =
    leadParts.length > 0
      ? `${leadParts.join(", and ")}.`
      : "Here’s where your campaigns stand.";

  return (
    <div className="space-y-6">
      <HomeGreeting
        title={greeting(contactName)}
        lead={lead}
        actions={
          <>
            <Link
              href="/business/creators"
              className={buttonVariants({ variant: "secondary" })}
            >
              <Search aria-hidden="true" />
              Find creators
            </Link>
            <Link href="/business/campaigns/new" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Post a campaign
            </Link>
          </>
        }
      />

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCallout key={alert.campaignId} alert={alert} />
          ))}
        </div>
      )}

      <SectionCard id="pipeline-title" title="Your hiring pipeline">
        <ol className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-hairline">
          <Step
            dot="bg-brand-violet"
            label="To review"
            value={waitingTotal}
            detail={
              waitingTotal === 0
                ? "No applications waiting"
                : `Across ${plural(waiting.length, "campaign", "campaigns")}`
            }
            href={waitingTotal > 0 ? reviewHref : undefined}
          />
          <Step
            dot="bg-brand-coral"
            label="To pay"
            value={pipeline.toPay.length}
            detail={
              pipeline.toPay.length === 0
                ? "Nothing to pay"
                : `Next by ${formatDateTime(pipeline.toPay[0].payBy)}`
            }
            href={
              pipeline.toPay.length > 0
                ? `/business/engagements/${pipeline.toPay[0].id}/pay`
                : undefined
            }
          />
          <Step
            dot="bg-brand-green"
            label="In progress"
            value={pipeline.inProgress}
            detail={
              pipeline.inProgress === 0
                ? "No paid hires running"
                : `${formatNaira(pipeline.escrowKobo)} held by Pitchype`
            }
          />
          <Step
            dot="bg-field"
            label="Completed"
            value={pipeline.completed}
            detail="Payment released to the creator"
          />
        </ol>
      </SectionCard>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <TaskList tasks={tasks} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
          <StatCard
            label="Wallet balance"
            value={formatNaira(walletKobo)}
            detail="Refunds, used first when you pay"
            icon={Wallet}
            tone="mint"
            href="/business/wallet"
          />
          <StatCard
            label="Live campaigns"
            value={String(liveCount)}
            detail={
              liveCount === 0 ? "None open right now" : "Creators can apply"
            }
            icon={Megaphone}
            tone="sun"
            href="/business/campaigns"
          />
        </div>
      </div>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-baseline justify-between gap-4">
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
          <EmptyState icon={Megaphone} tone="sun" title="No campaigns yet">
            Your campaigns show here once you post one. Describe what you want
            creators to post and who can apply. You’ll see how many creators
            qualify before it goes live.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

/** One stage of the pipeline: a coloured dot and label, the count, one line. */
function Step({
  dot,
  label,
  value,
  detail,
  href,
}: {
  dot: string;
  label: string;
  value: number;
  detail: string;
  href?: string;
}) {
  const content: ReactNode = (
    <>
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-muted">
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", dot)}
        />
        {label}
      </span>
      <span className="mt-1 block font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </span>
      <span className="block text-[0.8125rem] text-muted">{detail}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="block h-full p-4 hover:bg-surface-soft/60 motion-safe:transition-colors sm:px-5"
        >
          {content}
        </Link>
      ) : (
        <div className="p-4 sm:px-5">{content}</div>
      )}
    </li>
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
