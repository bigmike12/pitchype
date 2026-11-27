import { MessageSquarePlus } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FeedbackStatusPill } from "@/components/feedback/feedback-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/creator-profile";
import { listMyFeedback, type MyFeedbackRequest } from "@/lib/db/feedback";
import { kindLabel } from "@/lib/feedback";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Feedback" };

const PAGE_SIZE = 10;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function FeedbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading feedback…">
            <HeaderSkeleton />
            <FormSkeleton fields={3} />
            <PanelSkeleton lines={2} className="mt-6" />
          </PageLoading>
        }
      >
        <Feedback searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Feedback({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/feedback");
  const [requests, query] = await Promise.all([listMyFeedback(), searchParams]);
  const paged = pageOf(requests, parsePage(query.page), PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Feedback"
        lead="Tell us what would make Pitchype better, or what isn’t working. Only our team sees it."
      />

      <div className="space-y-6">
        <SectionCard id="send-title" title="Send a request" padded>
          <FeedbackForm />
        </SectionCard>

        {requests.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            tone="lilac"
            title="Your requests will show here"
          >
            <p>
              We read every request. When something you asked for ships, we’ll
              tell you.
            </p>
          </EmptyState>
        ) : (
          <SectionCard id="requests-title" title="Your requests">
            <ul className="divide-y divide-hairline">
              {paged.items.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </ul>
            <Pagination
              page={paged.page}
              pages={paged.pages}
              total={paged.total}
              pageSize={PAGE_SIZE}
              noun={["request", "requests"]}
              hrefFor={(page) => pagedHref("/feedback", {}, page)}
              framed
            />
          </SectionCard>
        )}
      </div>
    </>
  );
}

function RequestRow({ request }: { request: MyFeedbackRequest }) {
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-ink">
            <span className="text-muted tabular-nums">#{request.number}</span>{" "}
            {request.title}
          </p>
          <p className="mt-1 text-sm text-muted">
            {kindLabel(request.kind)} · sent {formatDate(request.createdAt)}
          </p>
        </div>
        <FeedbackStatusPill status={request.status} />
      </div>
      {request.merged && (
        <p className="mt-2 text-sm text-muted">Others asked for this too.</p>
      )}
      {request.adminNote && (
        <p className="mt-2 rounded-control bg-surface-soft px-3 py-2 text-sm break-words">
          <span className="font-semibold text-ink">From the team:</span>{" "}
          {request.adminNote}
        </p>
      )}
    </li>
  );
}
