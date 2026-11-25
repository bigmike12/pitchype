import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LedgerTable } from "@/components/money/ledger-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import {
  FormSkeleton,
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { isIdentityVerified } from "@/lib/db/identity";
import { formatDate } from "@/lib/creator-profile";
import {
  getCreatorWalletSummary,
  getWalletBalance,
  listMyLedger,
} from "@/lib/db/money";
import { getMyBankAccount, listMyPayouts } from "@/lib/db/payouts";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";
import { PaystackError, listBanks } from "@/lib/paystack";
import { describePayoutStatus } from "@/lib/payout-request";
import { cn } from "@/lib/utils";

import { BankAccountForm } from "./bank-account-form";
import { PayoutForm } from "./payout-form";

export const metadata: Metadata = { title: "Wallet" };

type SearchParams = Promise<{
  bank?: string | string[];
  page?: string | string[];
  payouts?: string | string[];
}>;

const HISTORY_PAGE_SIZE = 15;
const PAYOUTS_PAGE_SIZE = 5;
// The newest lines the history can page through.
const HISTORY_ROWS = 200;

export default function WalletPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading your wallet…">
            <HeaderSkeleton />
            <PanelSkeleton lines={2} />
            <FormSkeleton fields={2} className="mt-3" />
            <div className="mt-8">
              <SectionTitleSkeleton />
              <TableSkeleton rows={4} />
            </div>
          </PageLoading>
        }
      >
        <WalletContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PILL_TONES = {
  info: "bg-surface-card text-ink",
  success: "bg-brand-mint text-ink",
  attention: "bg-brand-sun text-ink",
} as const;

function StatementRow({
  label,
  kobo,
  total = false,
}: {
  label: string;
  kobo: number;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2.5",
        total && "font-semibold text-ink",
      )}
    >
      <dt className={total ? undefined : "text-body"}>{label}</dt>
      <dd className="tabular-nums">
        {kobo < 0 ? "−" : ""}
        {formatNaira(Math.abs(kobo))}
      </dd>
    </div>
  );
}

async function WalletContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("influencer");
  const { bank, page, payouts: payoutsPage } = await searchParams;
  // The balance is read with the secret-key client, so the id is the signed-in
  // person's, never anything from the request.
  const [balanceKobo, summary, ledger, bankAccount, payouts, identityVerified] =
    await Promise.all([
      getWalletBalance(user.id, "creator_wallet"),
      getCreatorWalletSummary(user.id),
      listMyLedger(HISTORY_ROWS),
      getMyBankAccount(),
      listMyPayouts(),
      isIdentityVerified(user.id),
    ]);
  const rows = ledger.filter((row) => row.account === "creator_wallet");
  // Two lists page on their own: `page` is the history, `payouts` the payouts.
  const history = pageOf(rows, parsePage(page), HISTORY_PAGE_SIZE);
  const shownPayouts = pageOf(
    payouts,
    parsePage(payoutsPage),
    PAYOUTS_PAGE_SIZE,
  );
  const walletHref = (historyPage: number, payoutPage: number) =>
    pagedHref(
      "/wallet",
      { payouts: payoutPage > 1 ? String(payoutPage) : undefined },
      historyPage,
    );

  // The bank list is only fetched when the form is shown.
  const showBankForm = bankAccount === null || bank === "change";
  let banks: { code: string; name: string }[] = [];
  let banksUnavailable = false;
  if (showBankForm) {
    try {
      banks = (await listBanks()).sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (!(error instanceof PaystackError)) throw error;
      banksUnavailable = true;
    }
  }

  return (
    <>
      <PageHeader title="Wallet" />

      <div className="space-y-3">
        <StatCard
          emphasis
          label="Your balance"
          value={formatNaira(balanceKobo)}
          detail="Ready to send to your bank"
          icon={Wallet}
          tone="lilac"
        />

        {summary.earnedKobo > 0 && (
          <SectionCard id="statement" title="How it adds up">
            <dl className="divide-y divide-hairline px-4 text-sm sm:px-5">
              <StatementRow
                label="Earned from jobs, before our fee"
                kobo={summary.earnedKobo}
              />
              <StatementRow label="Our fee" kobo={-summary.feeKobo} />
              {summary.payoutsKobo !== 0 && (
                <StatementRow
                  label="Sent to your bank, or on its way"
                  kobo={-summary.payoutsKobo}
                />
              )}
              {summary.otherKobo !== 0 && (
                <StatementRow label="Adjustments" kobo={summary.otherKobo} />
              )}
              <StatementRow
                label="In your wallet now"
                kobo={balanceKobo}
                total
              />
            </dl>
          </SectionCard>
        )}
        <p className="text-sm text-muted">
          Your earnings land here, less our fee, when a business accepts your
          work, or after 7 days if they don’t reply. Send them to your bank when
          you’re ready.
        </p>

        <SectionCard id="bank" title="Bank account" padded>
          {showBankForm ? (
            banksUnavailable ? (
              <div className="space-y-3">
                <p>
                  We couldn’t load the list of banks just now. Please try again
                  in a few minutes.
                </p>
                {bankAccount !== null && (
                  <Link
                    href="/wallet"
                    className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4"
                  >
                    Keep my current account
                  </Link>
                )}
              </div>
            ) : (
              <BankAccountForm
                banks={banks}
                hasAccount={bankAccount !== null}
              />
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 text-ink">
                {bankAccount.accountName} · {bankAccount.bankName} · ••••
                {bankAccount.last4}
              </p>
              <Link
                href="/wallet?bank=change"
                className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4"
              >
                Change
              </Link>
            </div>
          )}
        </SectionCard>

        <SectionCard id="payout" title="Ask for a payout" padded>
          <PayoutForm
            balanceKobo={balanceKobo}
            hasBankAccount={bankAccount !== null}
            identityRequired={!identityVerified}
          />
        </SectionCard>

        {payouts.length > 0 && (
          <SectionCard id="payouts" title="Your payouts">
            <ul className="divide-y divide-hairline">
              {shownPayouts.items.map((payout) => {
                const status = describePayoutStatus(payout);
                return (
                  <li key={payout.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink tabular-nums">
                          {formatNaira(payout.amountKobo)}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">
                          Transfer cost {formatNaira(payout.transferFeeKobo)} ·
                          asked {formatDate(payout.createdAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                          PILL_TONES[status.tone],
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    {status.detail && (
                      <p className="mt-2 text-sm">{status.detail}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination
              framed
              {...shownPayouts}
              noun={["payout", "payouts"]}
              hrefFor={(to) => `${walletHref(history.page, to)}#payouts`}
            />
          </SectionCard>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-display-md">History</h2>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} tone="lilac" title="Nothing here yet">
          Payments for your jobs and payouts will show up here.
        </EmptyState>
      ) : (
        <LedgerTable
          rows={history.items}
          footer={
            <Pagination
              framed
              {...history}
              noun={["line", "lines"]}
              hrefFor={(to) => walletHref(to, shownPayouts.page)}
            />
          }
        />
      )}
    </>
  );
}
