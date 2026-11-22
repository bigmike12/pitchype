import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminLedgerTable } from "@/components/money/admin-ledger-table";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { getMainBalanceKobo } from "@/lib/cray";
import { formatDateTime } from "@/lib/creator-profile";
import { listLedger } from "@/lib/db/money";
import {
  listPayoutsAwaitingApproval,
  listRecentDecidedPayouts,
  type PayoutForReview,
} from "@/lib/db/payouts";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import { adminPayoutStatus } from "@/lib/payout-request";
import { payoutFlagWords, providerName } from "@/lib/provider-words";

import { AttachReference } from "../attach-reference";
import { CheckPayout } from "../check-payout";
import { PayoutDecision } from "../payout-decision";

export const metadata: Metadata = { title: "Payouts" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-4xl">
      <Suspense
        fallback={
          <PageLoading label="Loading payouts…">
            <HeaderSkeleton crumbs />
            <SectionTitleSkeleton />
            <div className="space-y-3">
              <PanelSkeleton lines={4} />
              <PanelSkeleton lines={4} />
            </div>
            <div className="mt-10">
              <SectionTitleSkeleton />
              <PanelSkeleton lines={3} />
            </div>
          </PageLoading>
        }
      >
        <Payouts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const RECENT_LINES = 5;
// The most decided payouts the data layer returns at once.
const DECIDED_KEPT = 200;
const WAITING_PAGE_SIZE = 5;
const DECIDED_PAGE_SIZE = 15;

const destination = (p: PayoutForReview) =>
  `${p.bankName} ••••${p.last4} · ${p.accountName}`;

async function Payouts({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  // Two queries, so a long history can never push a waiting payout out of the
  // queue: every waiting one is listed, oldest request first.
  const [allWaiting, allDecided, query] = await Promise.all([
    listPayoutsAwaitingApproval(),
    listRecentDecidedPayouts(DECIDED_KEPT),
    searchParams,
  ]);
  const requested = Array.isArray(query.show) ? query.show[0] : query.show;
  const show = requested === "decided" ? "decided" : "waiting";
  const page = parsePage(query.page);
  const waiting = pageOf(allWaiting, page, WAITING_PAGE_SIZE);
  const decided = pageOf(allDecided, page, DECIDED_PAGE_SIZE);

  // Recent wallet lines for the waiting payouts on this page only, so one
  // page never makes dozens of lookups.
  // Cray pays out only from its Main Balance (collected money sits in a
  // Settlement Balance until the next working day), so show it beside the
  // Cray payouts. If it can't be read, say so rather than guess.
  const hasCrayPayouts =
    show === "waiting"
      ? waiting.items.some((p) => p.provider === "cray")
      : decided.items.some(
          (p) => p.provider === "cray" && p.status === "processing",
        );
  let crayMainKobo: number | null = null;
  let crayMainUnreadable = false;
  if (hasCrayPayouts) {
    try {
      crayMainKobo = await getMainBalanceKobo();
      crayMainUnreadable = crayMainKobo === null;
    } catch {
      crayMainUnreadable = true;
    }
  }

  const history =
    show === "waiting"
      ? await Promise.all(
          waiting.items.map(async (p) => {
            const lines = await listLedger({ person: p.creatorId, limit: 30 });
            return lines.rows
              .filter(
                (r) =>
                  r.account === "creator_wallet" &&
                  r.ownerUserId === p.creatorId,
              )
              .slice(0, RECENT_LINES);
          }),
        )
      : [];

  return (
    <>
      <PageHeader
        title="Payouts"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Check the bank account and the creator’s recent wallet activity, then approve or reject. Approving sends the money through the provider the payout was requested on. A payout still waiting for the bank can be checked with that provider."
      />

      {hasCrayPayouts && (
        <p className="mb-3 text-sm text-muted">
          {crayMainUnreadable
            ? "Cray’s Main Balance couldn’t be read just now."
            : `Cray’s Main Balance (what payouts are sent from): ${formatNaira(crayMainKobo ?? 0)}.`}
        </p>
      )}

      <FilterTabs
        label="Which payouts"
        current={show}
        className="mb-3"
        tabs={[
          {
            key: "waiting",
            label: "Waiting for approval",
            count: allWaiting.length,
            href: "/admin/money/payouts",
          },
          {
            key: "decided",
            label: "Decided",
            count: allDecided.length,
            href: "/admin/money/payouts?show=decided",
          },
        ]}
      />

      {show === "waiting" ? (
        <section aria-label="Waiting for approval">
          {waiting.total === 0 ? (
            <p className="rounded-card p-4 text-sm text-muted panel sm:px-5">
              Nothing waiting.
            </p>
          ) : (
            <ul className="space-y-3">
              {waiting.items.map((p, index) => (
                <li key={p.id} className="rounded-card panel p-4 sm:p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold break-words text-ink">
                        {p.creatorName || "Creator"}
                      </p>
                      <p className="text-sm break-words text-muted">
                        {destination(p)}
                      </p>
                      <p className="text-sm text-muted">
                        Sent through {providerName(p.provider)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-muted">
                      Asked {formatDateTime(p.createdAt)}
                    </p>
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Figure label="Taken from wallet" kobo={p.amountKobo} />
                    <Figure label="Transfer cost" kobo={p.transferFeeKobo} />
                    <Figure
                      label="Amount sent"
                      kobo={p.amountKobo - p.transferFeeKobo}
                      strong
                    />
                  </dl>

                  <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold text-ink">
                      Recent wallet activity
                    </h3>
                    {history[index] && history[index].length > 0 ? (
                      <AdminLedgerTable rows={history[index]} />
                    ) : (
                      <p className="text-sm text-muted">No wallet activity.</p>
                    )}
                    <Link
                      href={`/admin/money/ledger?person=${p.creatorId}`}
                      className="link mt-2 inline-flex min-h-11 items-center text-sm font-semibold"
                    >
                      Everything for this creator in the ledger
                    </Link>
                  </div>

                  <div className="mt-4 border-t border-hairline pt-4">
                    <PayoutDecision payoutId={p.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            {...waiting}
            noun={["payout", "payouts"]}
            hrefFor={(to) => pagedHref("/admin/money/payouts", {}, to)}
          />
        </section>
      ) : (
        <SectionCard id="decided-title" title="Decided payouts">
          {decided.total === 0 ? (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">
              No payouts decided yet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {decided.items.map((p) => (
                <li key={p.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <p className="font-semibold break-words text-ink">
                      {p.creatorName || "Creator"}
                      <span className="font-normal text-muted">
                        {" "}
                        · {formatNaira(p.amountKobo - p.transferFeeKobo)} sent
                      </span>
                    </p>
                    <p className="shrink-0 font-medium text-ink">
                      {adminPayoutStatus(p.status, p.provider)}
                    </p>
                  </div>
                  <p className="text-sm break-words text-muted">
                    {destination(p)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Asked {formatDateTime(p.createdAt)}
                    {p.approvedAt &&
                      `, decided ${formatDateTime(p.approvedAt)}`}
                    {p.approvedById &&
                      ` by admin ${p.approvedById.slice(0, 8)}`}
                    {p.paidAt && `, paid ${formatDateTime(p.paidAt)}`}
                  </p>
                  {p.decisionReason && (
                    <p className="mt-1 text-sm break-words text-ink">
                      “{p.decisionReason}”
                    </p>
                  )}
                  {p.status === "processing" && p.provider === "cray" && (
                    <p className="mt-1 text-sm text-ink">
                      {payoutFlagWords(p) ??
                        (p.providerReference
                          ? "Sent. Waiting for Cray to confirm."
                          : "Not sent yet. The next check sends it.")}
                    </p>
                  )}
                  {p.status === "reversed" && (
                    <p className="mt-1 text-sm font-semibold text-danger">
                      Flagged: Cray took this payout back after it was paid.
                    </p>
                  )}
                  <CheckPayout
                    payoutId={p.id}
                    processing={p.status === "processing"}
                    provider={p.provider}
                  />
                  {p.status === "processing" &&
                    p.provider === "cray" &&
                    p.providerReference === null && (
                      <AttachReference payoutId={p.id} />
                    )}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            framed
            {...decided}
            noun={["payout", "payouts"]}
            hrefFor={(to) =>
              pagedHref("/admin/money/payouts", { show: "decided" }, to)
            }
          />
        </SectionCard>
      )}
    </>
  );
}

function Figure({
  label,
  kobo,
  strong,
}: {
  label: string;
  kobo: number;
  strong?: boolean;
}) {
  return (
    <div className="rounded-card bg-surface-soft p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={
          strong
            ? "text-lg font-semibold tabular-nums text-ink"
            : "font-semibold tabular-nums text-ink"
        }
      >
        {formatNaira(kobo)}
      </dd>
    </div>
  );
}
