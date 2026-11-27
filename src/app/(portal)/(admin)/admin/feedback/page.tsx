import type { Metadata } from "next";
import { Suspense } from "react";

import { FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { listFeedbackForAdmin } from "@/lib/db/feedback";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  isFeedbackKind,
  isFeedbackStatus,
} from "@/lib/feedback";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";
import { FeedbackCard } from "./feedback-card";

export const metadata: Metadata = { title: "Feedback" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading feedback…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Feedback searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Feedback({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [requests, query] = await Promise.all([
    listFeedbackForAdmin(),
    searchParams,
  ]);
  const requestedStatus = first(query.status) ?? "";
  const status = isFeedbackStatus(requestedStatus)
    ? requestedStatus
    : "received";
  const requestedKind = first(query.kind) ?? "";
  const kind = isFeedbackKind(requestedKind) ? requestedKind : undefined;

  const ofKind = requests.filter((r) => !kind || r.kind === kind);
  const shown = ofKind.filter((r) => r.status === status);
  const page = parsePage(query.page);
  const statusLabel =
    FEEDBACK_STATUSES.find((s) => s.value === status)?.label ?? status;

  return (
    <>
      <PageHeader
        title="Feedback"
        lead="Ideas and problems from businesses and creators. Set a status and a note; when a request ships, its sender and everyone merged into it are told."
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <FilterTabs
          label="Requests by status"
          current={status}
          tabs={FEEDBACK_STATUSES.map((s) => ({
            key: s.value,
            label: s.label,
            count: ofKind.filter((r) => r.status === s.value).length,
            href: pagedHref("/admin/feedback", { status: s.value, kind }, 1),
          }))}
        />
        <FilterTabs
          label="Requests by kind"
          current={kind ?? "all"}
          tabs={[
            {
              key: "all",
              label: "All",
              count: requests.filter((r) => r.status === status).length,
              href: pagedHref("/admin/feedback", { status }, 1),
            },
            ...FEEDBACK_KINDS.map((k) => ({
              key: k.value,
              label: k.value === "idea" ? "Ideas" : "Problems",
              count: requests.filter(
                (r) => r.status === status && r.kind === k.value,
              ).length,
              href: pagedHref("/admin/feedback", { status, kind: k.value }, 1),
            })),
          ]}
        />
      </div>
      <QueueCard
        id="feedback-title"
        title={statusLabel}
        empty="Nothing here."
        paged={pageOf(shown, page, QUEUE_PAGE_SIZE)}
        noun={["request", "requests"]}
        hrefFor={(to) => pagedHref("/admin/feedback", { status, kind }, to)}
      >
        {(request) => <FeedbackCard key={request.id} request={request} />}
      </QueueCard>
    </>
  );
}
