import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { REPORT_REASONS, formatDateTime } from "@/lib/creator-profile";
import {
  listOpenCampaignReports,
  type OpenCampaignReport,
} from "@/lib/db/campaigns";
import { listOpenReports, type OpenReport } from "@/lib/db/reports";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import {
  hideReportedCreatorAction,
  hideReportedSampleAction,
  removeReportedCoverAction,
  removeReportedPhotoAction,
  resolveCampaignReportAction,
  resolveReportAction,
  takeDownCampaignAction,
} from "../actions";
import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";

export const metadata: Metadata = { title: "Reports" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading reports…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reports({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [reports, campaignReports, query] = await Promise.all([
    listOpenReports(),
    listOpenCampaignReports(),
    searchParams,
  ]);
  const requested = Array.isArray(query.about) ? query.about[0] : query.about;
  const about = requested === "campaigns" ? "campaigns" : "creators";
  const page = parsePage(query.page);

  return (
    <>
      <PageHeader
        title="Reports"
        lead="What people have reported: creator profiles and campaigns. Close a report when nothing is wrong, or act on it."
      />
      <FilterTabs
        label="What the reports are about"
        current={about}
        className="mb-3"
        tabs={[
          {
            key: "creators",
            label: "Creators",
            count: reports.length,
            href: "/admin/reports",
          },
          {
            key: "campaigns",
            label: "Campaigns",
            count: campaignReports.length,
            href: "/admin/reports?about=campaigns",
          },
        ]}
      />
      {about === "creators" ? (
        <QueueCard
          id="reports-title"
          title="Reports on creators"
          empty="No open reports."
          paged={pageOf(reports, page, QUEUE_PAGE_SIZE)}
          noun={["report", "reports"]}
          hrefFor={(to) => pagedHref("/admin/reports", {}, to)}
        >
          {(report) => <ReportItem key={report.id} report={report} />}
        </QueueCard>
      ) : (
        <QueueCard
          id="campaign-reports-title"
          title="Reports on campaigns"
          empty="No open reports."
          paged={pageOf(campaignReports, page, QUEUE_PAGE_SIZE)}
          noun={["report", "reports"]}
          hrefFor={(to) =>
            pagedHref("/admin/reports", { about: "campaigns" }, to)
          }
        >
          {(report) => <CampaignReportItem key={report.id} report={report} />}
        </QueueCard>
      )}
    </>
  );
}

function ReportItem({ report }: { report: OpenReport }) {
  const reason =
    REPORT_REASONS.find((r) => r.value === report.reason)?.label ??
    report.reason;
  const { creator } = report;
  return (
    <li className="p-4 sm:p-5">
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

      {(creator.coverUrl || creator.samples.length > 0) && (
        <details className="mt-4 border-t border-hairline pt-4">
          <summary className="link inline-flex min-h-11 cursor-pointer items-center text-sm lg:min-h-8">
            Their cover and work samples (
            {(creator.coverUrl ? 1 : 0) + creator.samples.length})
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {creator.coverUrl && (
              <TakedownItem
                imageUrl={creator.coverUrl}
                label="Cover"
                wide
                action={removeReportedCoverAction}
                hidden={{ creatorId: creator.userId }}
                fieldId={`cover-reason-${report.id}`}
                reasonLabel="Reason (kept on record)"
                button="Remove cover"
              />
            )}
            {creator.samples.map((sample, index) => (
              <TakedownItem
                key={sample.id}
                imageUrl={sample.imageUrl}
                label={sample.caption ?? `Sample ${index + 1}`}
                action={hideReportedSampleAction}
                hidden={{ sampleId: sample.id }}
                fieldId={`sample-reason-${report.id}-${sample.id}`}
                reasonLabel="Reason (the creator sees this)"
                button="Take down"
              />
            ))}
          </ul>
        </details>
      )}

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

/** One picture an admin can take down, with the reason the creator will see. */
function TakedownItem({
  imageUrl,
  label,
  wide,
  action,
  hidden,
  fieldId,
  reasonLabel,
  button,
}: {
  imageUrl: string;
  label: string;
  wide?: boolean;
  action: (form: FormData) => Promise<void>;
  hidden: Record<string, string>;
  fieldId: string;
  reasonLabel: string;
  button: string;
}) {
  return (
    <li className="rounded-card bg-canvas p-3 ring-1 ring-hairline">
      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden rounded-lg bg-surface-soft ${wide ? "aspect-video w-28" : "aspect-[4/5] w-16"}`}
        >
          <Image
            src={imageUrl}
            alt={label}
            fill
            unoptimized
            sizes="7rem"
            className="object-cover"
          />
        </div>
        <p className="min-w-0 text-sm font-medium break-words text-ink">
          {label}
        </p>
      </div>
      <form action={action} className="mt-3 flex flex-col gap-2">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <TextField
          compact
          id={fieldId}
          label={reasonLabel}
          name="reason"
          required
          minLength={2}
          maxLength={200}
        />
        <Button type="submit" variant="secondary" size="sm">
          {button}
        </Button>
      </form>
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
    <li className="p-4 sm:p-5">
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
