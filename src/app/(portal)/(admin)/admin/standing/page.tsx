import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getStandingReview, type StrikeRecord } from "@/lib/db/moderation";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

import { QUEUE_PAGE_SIZE, QueueCard } from "../queue";
import { StandingDecision } from "../standing-review";

export const metadata: Metadata = { title: "Account standing" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function StandingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading account standing…">
            <HeaderSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={3} />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Standing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Open appeals, suspensions (with the person's live campaigns and hires,
// which suspension leaves unchanged), and strikes from the last 30 days.
// Each list pages on its own search param.
async function Standing({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const [review, query] = await Promise.all([
    getStandingReview(),
    searchParams,
  ]);
  const appeals = pageOf(
    review.appeals,
    parsePage(query.appeals),
    QUEUE_PAGE_SIZE,
  );
  const suspended = pageOf(
    review.suspended,
    parsePage(query.suspended),
    QUEUE_PAGE_SIZE,
  );
  const strikes = pageOf(
    review.recentStrikes,
    parsePage(query.page),
    QUEUE_PAGE_SIZE,
  );
  const href = (to: { appeals: number; suspended: number; strikes: number }) =>
    pagedHref(
      "/admin/standing",
      {
        appeals: to.appeals > 1 ? String(to.appeals) : undefined,
        suspended: to.suspended > 1 ? String(to.suspended) : undefined,
      },
      to.strikes,
    );
  const at = {
    appeals: appeals.page,
    suspended: suspended.page,
    strikes: strikes.page,
  };

  return (
    <>
      <PageHeader
        title="Account standing"
        lead="Appeals to answer, suspended accounts to review, and recent strikes. Suspension never takes money: running work and payouts carry on."
      />
      <div className="space-y-3">
        <QueueCard
          id="appeals-title"
          title="Appeals"
          empty="No open appeals."
          paged={appeals}
          noun={["appeal", "appeals"]}
          hrefFor={(page) => href({ ...at, appeals: page })}
        >
          {(a) => (
            <li key={a.id} className="p-4 sm:p-5">
              <p className="font-semibold text-ink">
                Appeal from {a.name}{" "}
                <span className="font-normal text-muted">({a.email})</span>
              </p>
              <p className="text-sm text-muted">
                {formatDateTime(a.createdAt)} · {a.activeStrikes} active strikes
                {a.suspended ? " · suspended" : ""}
              </p>
              <p className="mt-2 break-words whitespace-pre-line">
                {a.message}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6">
                <StandingDecision decision="answer" target={a.id} />
                <StandingDecision decision="decline" target={a.id} />
              </div>
            </li>
          )}
        </QueueCard>

        <QueueCard
          id="suspended-title"
          title="Suspended accounts"
          empty="Nobody is suspended."
          paged={suspended}
          noun={["account", "accounts"]}
          hrefFor={(page) => href({ ...at, suspended: page })}
        >
          {(p) => (
            <li key={p.userId} className="p-4 sm:p-5">
              <p className="font-semibold text-ink">
                {p.name}{" "}
                <span className="font-normal text-muted">
                  ({p.email}, {p.role})
                </span>
              </p>
              <p className="text-sm text-muted">
                Suspended {formatDateTime(p.suspendedAt)}
              </p>
              <StrikeList strikes={p.strikes} />
              {(p.campaigns.length > 0 || p.engagements.length > 0) && (
                <p className="mt-3 text-sm">
                  Unchanged by the suspension:{" "}
                  {[
                    ...p.campaigns.map(
                      (k) => `campaign “${k.title}” (${k.status})`,
                    ),
                    ...p.engagements.map(
                      (e) =>
                        `hire on “${e.campaignTitle}” at ${formatNaira(e.agreedPriceKobo)} (${e.status})`,
                    ),
                  ].join("; ")}
                  .
                </p>
              )}
              <div className="mt-3">
                <StandingDecision decision="lift" target={p.userId} />
              </div>
            </li>
          )}
        </QueueCard>

        <QueueCard
          id="strikes-title"
          title="Strikes in the last 30 days"
          empty="No strikes in the last 30 days."
          paged={strikes}
          noun={["strike", "strikes"]}
          hrefFor={(page) => href({ ...at, strikes: page })}
        >
          {(s) => (
            <li key={s.id} className="p-4 sm:px-5">
              <p className="font-semibold text-ink">
                {s.name}{" "}
                <span className="font-normal text-muted">({s.email})</span>
              </p>
              <StrikeList strikes={[s]} />
            </li>
          )}
        </QueueCard>
      </div>
    </>
  );
}

function StrikeList({ strikes }: { strikes: StrikeRecord[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {strikes.map((s) => (
        <li key={s.id} className="text-sm">
          <span
            className={s.voided ? "line-through" : "font-semibold text-ink"}
          >
            {s.flag}
          </span>{" "}
          · {formatDateTime(s.createdAt)}
          {s.voided && " · removed"}
          <blockquote className="mt-1 border-l-2 border-hairline pl-3 break-words whitespace-pre-line">
            {s.detail}
          </blockquote>
          {!s.voided && <StandingDecision decision="void" target={s.id} />}
        </li>
      ))}
    </ul>
  );
}
