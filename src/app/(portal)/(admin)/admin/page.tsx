import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { PlatformIcon } from "@/components/creators/platform-icon";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  listCampaignsForReview,
  listOpenCampaignReports,
  type CampaignForReview,
  type OpenCampaignReport,
} from "@/lib/db/campaigns";
import {
  PLATFORM_RULES,
  REPORT_REASONS,
  formatDateTime,
} from "@/lib/creator-profile";
import {
  listHiddenCreators,
  listOpenReports,
  type OpenReport,
} from "@/lib/db/reports";
import {
  listVerificationQueue,
  type VerificationQueueItem,
} from "@/lib/db/verification";

import {
  approveCampaignAction,
  hideReportedCreatorAction,
  removeReportedPhotoAction,
  resolveCampaignReportAction,
  resolveReportAction,
  sendBackCampaignAction,
  takeDownCampaignAction,
  unhideCreatorAction,
} from "./actions";
import { ReviewForm } from "./review-form";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton />
            <SectionTitleSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={2} />
              <PanelSkeleton lines={2} />
              <PanelSkeleton lines={2} />
            </div>
          </PageLoading>
        }
      >
        <Admin />
      </Suspense>
    </div>
  );
}

async function Admin() {
  await requireRole("admin");
  const [campaignsToReview, campaignReports, queue, reports, hidden] =
    await Promise.all([
      listCampaignsForReview(),
      listOpenCampaignReports(),
      listVerificationQueue(),
      listOpenReports(),
      listHiddenCreators(),
    ]);

  return (
    <>
      <PageHeader
        title="Admin"
        lead="First campaigns to review, verification requests, reports and hidden profiles."
      />

      <section aria-labelledby="campaign-review-title" className="mt-10">
        <h2 id="campaign-review-title" className="text-display-md">
          First campaigns to review ({campaignsToReview.length})
        </h2>
        <p className="mt-2 max-w-xl">
          A business’s first campaign waits here. Read it, then approve it or
          send it back with a note the business sees. Later campaigns from an
          approved business go live without review.
        </p>
        {campaignsToReview.length === 0 ? (
          <p className="mt-4 text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {campaignsToReview.map((c) => (
              <CampaignReviewItem key={c.id} campaign={c} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="queue-title" className="mt-14">
        <h2 id="queue-title" className="text-display-md">
          Handles to verify ({queue.length})
        </h2>
        <p className="mt-2 max-w-xl">
          Open the profile, check the code is in the bio, and note the follower
          count you see. Oldest first.
        </p>
        {queue.length === 0 ? (
          <p className="mt-4 text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {queue.map((item) => (
              <VerificationItem key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reports-title" className="mt-14">
        <h2 id="reports-title" className="text-display-md">
          Reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="mt-4 text-muted">No open reports.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {reports.map((report) => (
              <ReportItem key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="campaign-reports-title" className="mt-14">
        <h2 id="campaign-reports-title" className="text-display-md">
          Campaign reports ({campaignReports.length})
        </h2>
        {campaignReports.length === 0 ? (
          <p className="mt-4 text-muted">No open reports.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {campaignReports.map((report) => (
              <CampaignReportItem key={report.id} report={report} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hidden-title" className="mt-14">
        <h2 id="hidden-title" className="text-display-md">
          Hidden profiles ({hidden.length})
        </h2>
        {hidden.length === 0 ? (
          <p className="mt-4 text-muted">None.</p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline rounded-card panel">
            {hidden.map((creator) => (
              <li
                key={creator.userId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {creator.displayName}
                  </p>
                  <p className="text-sm text-muted">
                    “{creator.reason}”, {formatDateTime(creator.hiddenAt)}
                  </p>
                </div>
                <form action={unhideCreatorAction}>
                  <input
                    type="hidden"
                    name="creatorId"
                    value={creator.userId}
                  />
                  <Button type="submit" variant="secondary">
                    Show again
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function VerificationItem({ item }: { item: VerificationQueueItem }) {
  const rules = PLATFORM_RULES[item.platform];
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={item.platform} className="mt-1 size-5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            <a
              href={rules.profileUrl(item.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="link break-all"
            >
              {rules.label}: @{item.handle}
              <span className="sr-only"> (opens {rules.label})</span>
            </a>
          </p>
          <p className="text-sm text-muted">
            {item.creator.slug ? (
              <Link href={`/creators/${item.creator.slug}`} className="link">
                {item.creator.displayName}
              </Link>
            ) : (
              item.creator.displayName
            )}
            , submitted {formatDateTime(item.submittedAt)}
          </p>
          <p className="mt-3 text-sm text-muted">Code to look for</p>
          <p className="text-xl font-semibold tracking-wide text-ink select-all">
            {item.code}
          </p>
        </div>
      </div>
      {item.verifiedElsewhere && (
        <p className="mt-4 flex gap-2 rounded-card bg-brand-sun p-3 text-sm text-ink">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            This handle is verified on another account,{" "}
            <strong>{item.verifiedElsewhere.displayName}</strong>. Verifying
            here removes their badge. Only do it if this code is in the bio now.
          </span>
        </p>
      )}
      <ReviewForm
        requestId={item.id}
        movesBadge={Boolean(item.verifiedElsewhere)}
      />
    </li>
  );
}

function ReportItem({ report }: { report: OpenReport }) {
  const reason =
    REPORT_REASONS.find((r) => r.value === report.reason)?.label ??
    report.reason;
  const { creator } = report;
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <CreatorPhoto
          name={creator.displayName}
          url={creator.photoUrl}
          sizes="4rem"
          className="size-16 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {creator.slug ? (
              <Link href={`/creators/${creator.slug}`} className="link">
                {creator.displayName}
              </Link>
            ) : (
              creator.displayName
            )}
            {creator.hidden && (
              <span className="ml-2 text-sm font-normal text-muted">
                (already hidden)
              </span>
            )}
          </p>
          <p className="text-sm text-muted">
            {reason}, {formatDateTime(report.createdAt)}
          </p>
          {report.details && (
            <p className="mt-2 whitespace-pre-line text-ink">
              “{report.details}”
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={resolveReportAction}>
          <input type="hidden" name="reportId" value={report.id} />
          <Button type="submit" variant="secondary">
            Nothing wrong: close
          </Button>
        </form>
        {creator.photoVersion !== null && (
          <form action={removeReportedPhotoAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <input type="hidden" name="creatorId" value={creator.userId} />
            <Button type="submit" variant="secondary">
              Remove photo and close
            </Button>
          </form>
        )}
      </div>

      {!creator.hidden && (
        <form
          action={hideReportedCreatorAction}
          className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="reportId" value={report.id} />
          <input type="hidden" name="creatorId" value={creator.userId} />
          <TextField
            id={`hide-reason-${report.id}`}
            label="Reason (the creator sees this)"
            name="reason"
            required
            minLength={2}
            maxLength={200}
            className="flex-1"
          />
          <Button type="submit">Hide profile and close</Button>
        </form>
      )}
    </li>
  );
}

function CampaignReviewItem({ campaign }: { campaign: CampaignForReview }) {
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <p className="font-semibold text-ink">
        <Link href={`/campaigns/${campaign.id}`} className="link">
          {campaign.title}
        </Link>
      </p>
      <p className="text-sm text-muted">
        {campaign.businessName}, submitted{" "}
        {formatDateTime(campaign.submittedAt)}
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <form action={approveCampaignAction}>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <Button type="submit">Approve</Button>
        </form>
        <form
          action={sendBackCampaignAction}
          className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="campaignId" value={campaign.id} />
          <TextField
            id={`send-back-${campaign.id}`}
            label="Or send back with a note"
            name="note"
            required
            minLength={2}
            maxLength={500}
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            Send back
          </Button>
        </form>
      </div>
    </li>
  );
}

const CAMPAIGN_REPORT_REASONS: Record<OpenCampaignReport["reason"], string> = {
  scam_or_fraud: "Looks like a scam",
  off_platform_contact: "Asks to deal outside Pitchype",
  banned_content: "Banned content",
  misleading: "Misleading",
  other: "Something else",
};

function CampaignReportItem({ report }: { report: OpenCampaignReport }) {
  const live = ["pending_review", "open", "paused"].includes(
    report.campaign.status,
  );
  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <p className="font-semibold text-ink">
        <Link href={`/campaigns/${report.campaign.id}`} className="link">
          {report.campaign.title}
        </Link>
        {!live && (
          <span className="ml-2 text-sm font-normal text-muted">
            (no longer live)
          </span>
        )}
      </p>
      <p className="text-sm text-muted">
        {report.campaign.businessName}: {CAMPAIGN_REPORT_REASONS[report.reason]}
        , {formatDateTime(report.createdAt)}
      </p>
      {report.details && (
        <p className="mt-2 whitespace-pre-line text-ink">“{report.details}”</p>
      )}
      <form action={resolveCampaignReportAction} className="mt-4">
        <input type="hidden" name="reportId" value={report.id} />
        <Button type="submit" variant="secondary">
          Nothing wrong: close
        </Button>
      </form>
      {live && (
        <form
          action={takeDownCampaignAction}
          className="mt-4 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="reportId" value={report.id} />
          <input type="hidden" name="campaignId" value={report.campaign.id} />
          <TextField
            id={`take-down-${report.id}`}
            label="Reason (the business sees this)"
            name="reason"
            required
            minLength={2}
            maxLength={200}
            className="flex-1"
          />
          <Button type="submit">Take down and close</Button>
        </form>
      )}
    </li>
  );
}
