import {
  CircleCheck,
  CircleSlash,
  Clock,
  Hammer,
  Hourglass,
  Scale,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CampaignTimeline } from "@/components/campaigns/campaign-timeline";
import { CheckpointList } from "@/components/checkpoints/checkpoint-list";
import { CheckpointTrail } from "@/components/checkpoints/checkpoint-trail";
import { ClickProofList } from "@/components/clicks/click-proof-list";
import { ClickSummary } from "@/components/clicks/click-summary";
import { DisputeForm } from "@/components/engagement/dispute-form";
import { Rounds } from "@/components/engagement/rounds";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { lagosToday } from "@/lib/campaign";
import { dueDay, numberRows, outstandingRows } from "@/lib/checkpoint-words";
import { lagosDate } from "@/lib/checkpoints";
import {
  listCheckpointEvents,
  listHireCheckpoints,
} from "@/lib/db/checkpoints";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementDetails } from "@/lib/db/applications";
import { listClickProofs } from "@/lib/db/click-proofs";
import { getEngagementClicks } from "@/lib/db/clicks";
import { getLatestDisputeId } from "@/lib/db/disputes";
import { listSubmissions } from "@/lib/db/submissions";
import { formatRate, INFLUENCER_FEE_BPS, MIN_FEE_KOBO } from "@/lib/fees";
import { describeJobStatus } from "@/lib/job-status-words";
import { formatNaira } from "@/lib/money";
import { CONTACT_EMAIL } from "@/lib/site";

import {
  openDisputeAction,
  submitCheckpointAction,
  submitKickoffAction,
} from "./actions";
import { ClickProofForm } from "./click-proof-form";
import { StartWorkForm } from "./start-form";
import { SubmitForm } from "./submit-form";
import { WithdrawForm } from "./withdraw-form";

export const metadata: Metadata = { title: "Your job" };

type Params = Promise<{ id: string }>;

const UNSETTLED = [
  "awaiting_payment",
  "funded",
  "in_progress",
  "submitted",
  "denied",
  "disputed",
];

// The callout's look by job status; anything else (paid out, accepted,
// released) reads as a success.
const CALLOUTS: Record<
  string,
  { tone: "info" | "attention" | "success"; icon: LucideIcon }
> = {
  awaiting_payment: { tone: "attention", icon: Clock },
  in_progress: { tone: "success", icon: Hammer },
  submitted: { tone: "info", icon: Hourglass },
  denied: { tone: "attention", icon: Undo2 },
  disputed: { tone: "info", icon: Scale },
  cancelled: { tone: "info", icon: CircleSlash },
  refunded: { tone: "info", icon: CircleSlash },
};

export default function JobPage({ params }: { params: Params }) {
  return (
    <div className="max-w-5xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the job…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={2} />
            <div className="mt-4">
              <FormSkeleton fields={3} />
            </div>
            <div className="mt-4">
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Job params={params} />
      </Suspense>
    </div>
  );
}

async function Job({ params }: { params: Params }) {
  const user = await requireRole("influencer");
  const { id } = await params;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.creator.id !== user.id) notFound();
  // Newest round first: while resubmitting, the latest reasons come first.
  const rounds = (await listSubmissions(engagement.id)).reverse();
  // Kept after the dispute ends, so either person can read how it went.
  const disputeId = await getLatestDisputeId(engagement.id);
  // Null unless this is a per-click hire: then the clicks are the work, and
  // there is no proof to review (proof for the record comes in Part 2).
  const clicks = await getEngagementClicks(engagement.id);
  const proofs = clicks ? await listClickProofs(engagement.id) : [];
  // Kickoff and checkpoints exist only for campaigns that asked for them.
  const campaign = engagement.campaign;
  const checkpointRows = campaign.checkpointsEnabled
    ? await listHireCheckpoints(engagement.id)
    : [];
  const checkpointEvents = campaign.checkpointsEnabled
    ? await listCheckpointEvents(engagement.id)
    : [];
  const now = new Date();
  const outstanding = outstandingRows(checkpointRows, now);
  const outstandingTitles = numberRows(checkpointRows)
    .filter((r) => outstanding.some((o) => o.id === r.id))
    .map((r) => r.title);
  const platforms = [...new Set(campaign.deliverables.map((d) => d.platform))];
  // Evidence can be sent while the job is running, never after it has settled.
  const canSendEvidence =
    ["in_progress", "submitted", "denied", "disputed"].includes(
      engagement.status,
    ) && engagement.settledAt === null;
  const clicksOver =
    clicks?.clicksEndAt !== null &&
    clicks?.clicksEndAt !== undefined &&
    new Date(clicks.clicksEndAt) <= new Date();

  const business = engagement.business.name;
  const clickTiming =
    clicks && clicks.clicksEndAt && clicks.settlesAt
      ? {
          endsAt: clicks.clicksEndAt,
          settlesAt: clicks.settlesAt,
          stoppedAt: clicks.clicksStoppedAt,
        }
      : null;
  const status = describeJobStatus(
    { ...engagement, businessName: business },
    new Date(),
    clickTiming,
  );
  const rate = formatRate(engagement.creatorFeeBps ?? INFLUENCER_FEE_BPS);
  // The full-price figure only applies until the job settles; after that the
  // callout says what actually reached the wallet.
  const showEarnings = !clicks && UNSETTLED.includes(engagement.status);
  const feeKobo = engagement.agreedPriceKobo - status.youReceiveKobo;
  const minFee = formatNaira(engagement.creatorMinFeeKobo ?? MIN_FEE_KOBO);

  const callout = CALLOUTS[engagement.status] ?? {
    tone: "success",
    icon: CircleCheck,
  };

  const timeline = [
    { label: "Approved", at: engagement.approvedAt },
    { label: "Paid", at: engagement.fundedAt },
    { label: "Work started", at: engagement.startedAt },
    {
      label: engagement.status === "cancelled" ? "Cancelled" : "Settled",
      at: engagement.settledAt ?? engagement.cancelledAt,
    },
  ].flatMap((step) => (step.at ? [{ label: step.label, at: step.at }] : []));

  return (
    <>
      <PageHeader
        title={engagement.campaign.title}
        crumbs={[{ href: "/applications", label: "Your work" }]}
        lead={`A job for ${business}.`}
      />

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="xl:col-start-1">
          <Callout tone={callout.tone} icon={callout.icon} title={status.title}>
            {status.body}
          </Callout>
        </div>
        <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {showEarnings && (
            <>
              <dl className="space-y-3 rounded-card p-4 text-sm panel sm:p-5">
                <div className="flex justify-between gap-4">
                  <dt>Agreed price</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(engagement.agreedPriceKobo)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-hairline pt-3">
                  <dt className="font-semibold text-ink">You’ll receive</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(status.youReceiveKobo)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-muted">
                That’s after our {formatNaira(feeKobo)} fee ({rate}, at least{" "}
                {minFee}), which comes off when the payment is released to your
                wallet.
              </p>
            </>
          )}
        </div>
        <div className="space-y-4 xl:col-start-1">
          {clicks && (
            <SectionCard id="clicks-title" title="Your clicks" padded>
              {engagement.settledAt && engagement.releasedKobo !== null && (
                <dl className="mb-5 grid grid-cols-2 gap-3 rounded-card bg-surface-soft p-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-sm text-muted">Clicks counted</dt>
                    <dd className="mt-1 font-semibold text-ink tabular-nums">
                      {clicks.billable.toLocaleString("en-NG")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Released</dt>
                    <dd className="mt-1 font-semibold text-ink tabular-nums">
                      {formatNaira(engagement.releasedKobo)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Our fee</dt>
                    <dd className="mt-1 font-semibold text-ink tabular-nums">
                      {formatNaira(
                        engagement.releasedKobo -
                          (engagement.creatorNetKobo ?? 0),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">You received</dt>
                    <dd className="mt-1 font-semibold text-ink tabular-nums">
                      {formatNaira(engagement.creatorNetKobo ?? 0)}
                    </dd>
                  </div>
                </dl>
              )}
              <ClickSummary
                stats={clicks}
                viewer="creator"
                settled={engagement.settledAt !== null}
              />
            </SectionCard>
          )}
          {clicks && proofs.length > 0 && (
            <SectionCard id="posts-title" title="Where you posted">
              <ClickProofList proofs={proofs} />
            </SectionCard>
          )}
          {clicks && proofs.length === 0 && clicksOver && (
            <p className="text-sm text-muted">No posts added yet.</p>
          )}
          {clicks &&
            engagement.status === "in_progress" &&
            !clicks.clicksStoppedAt &&
            !engagement.settledAt && (
              <ClickProofForm engagementId={engagement.id} />
            )}
          <SectionCard
            id="campaign-timeline-title"
            title="Campaign timeline"
            padded
          >
            <CampaignTimeline
              start={campaign.postFrom}
              liveFrom={
                engagement.approvedAt
                  ? lagosDate(new Date(engagement.approvedAt))
                  : lagosToday(now)
              }
              deliverBy={campaign.deliverBy}
              endsOn={campaign.endsOn}
              checkpoints={checkpointRows
                .filter((r) => r.kind === "progress" && r.status !== "skipped")
                .map(dueDay)}
              today={lagosToday(now)}
            />
          </SectionCard>
          {checkpointRows.length > 0 && (
            <SectionCard id="checkpoints-title" title="Kickoff and checkpoints">
              <CheckpointList
                rows={checkpointRows}
                viewer="creator"
                engagementId={engagement.id}
                required={campaign.checkpointEvidence}
                platforms={platforms}
                now={now}
                canSend={canSendEvidence}
                kickoffAction={submitKickoffAction}
                checkpointAction={submitCheckpointAction}
              />
            </SectionCard>
          )}
          {rounds.length > 0 && (
            <SectionCard id="rounds-title" title="Your submissions">
              <Rounds rounds={rounds} />
            </SectionCard>
          )}
          {!clicks && (status.canSubmit || status.canResubmit) && (
            <SubmitForm
              engagementId={engagement.id}
              deliverables={engagement.campaign.deliverables}
              deliverBy={engagement.campaign.deliverBy}
              resubmit={status.canResubmit}
              roundsLeft={engagement.roundsLeft}
              finalRequirements={campaign.finalRequirements}
              platforms={platforms}
              outstanding={outstandingTitles}
            />
          )}
          {disputeId && (
            <Link
              href={`/jobs/${engagement.id}/dispute`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {engagement.openDisputeId
                ? "See the dispute"
                : "See the closed dispute"}
            </Link>
          )}

          <SectionCard id="timeline" title="What’s happened">
            <ol className="divide-y divide-hairline">
              {timeline.map((step) => (
                <li
                  key={step.label}
                  className="flex justify-between gap-4 px-4 py-3 text-sm sm:px-5"
                >
                  <span className="font-semibold text-ink">{step.label}</span>
                  <time dateTime={step.at} className="text-muted">
                    {formatDateTime(step.at)}
                  </time>
                </li>
              ))}
            </ol>
          </SectionCard>

          {checkpointEvents.length > 0 && (
            <SectionCard id="checkpoint-trail-title" title="Checkpoint trail">
              <CheckpointTrail
                events={checkpointEvents}
                rows={checkpointRows}
              />
            </SectionCard>
          )}

          {status.canStart && <StartWorkForm engagementId={engagement.id} />}
          {status.canOpenDispute && (
            <DisputeForm
              engagementId={engagement.id}
              action={openDisputeAction}
              intro={
                clicks
                  ? "If the click count looks wrong, or something else needs sorting before you’re paid, tell us why. An admin will read both sides and decide how the money is paid out. Nothing settles while a dispute is open."
                  : "If you think the business was wrong to send your work back, tell us why. An admin will read both sides and decide how the money is paid out. While a dispute is open you can’t send the work in again."
              }
            />
          )}
          {status.canWithdraw && (
            <WithdrawForm
              engagementId={engagement.id}
              businessName={business}
              afterStart={engagement.status !== "funded"}
              perClick={clicks !== null}
            />
          )}
          {engagement.status === "in_progress" && (
            <p className="mt-8 border-t border-hairline pt-5">
              Work has started, so the business can’t cancel on its own. If
              something goes wrong, contact {CONTACT_EMAIL}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
