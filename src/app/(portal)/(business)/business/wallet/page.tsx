import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { LedgerTable } from "@/components/money/ledger-table";
import { TransferAccount } from "@/components/money/transfer-account";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import {
  getMyDepositAccount,
  getWalletBalance,
  listMyLedger,
} from "@/lib/db/money";
import { formatNaira } from "@/lib/money";
import { pageOf, pagedHref, parsePage } from "@/lib/paging";

export const metadata: Metadata = { title: "Wallet" };

const PAGE_SIZE = 15;
// The newest lines the history can page through.
const HISTORY_ROWS = 200;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

async function WalletContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("business");
  const query = await searchParams;
  // The balance is read with the secret-key client, so the id is the signed-in
  // person's, never anything from the request.
  const [balanceKobo, ledger, transferAccount] = await Promise.all([
    getWalletBalance(user.id, "business_wallet"),
    listMyLedger(HISTORY_ROWS),
    getMyDepositAccount(),
  ]);
  const rows = ledger.filter((row) => row.account === "business_wallet");
  const paged = pageOf(rows, parsePage(query.page), PAGE_SIZE);

  return (
    <>
      <PageHeader title="Wallet" />

      <StatCard
        emphasis
        label="Your balance"
        value={formatNaira(balanceKobo)}
        detail="Used first when you pay for your next hire"
        icon={Wallet}
        tone="mint"
      />
      <p className="mt-3 text-sm text-muted">
        Money comes back here when a hire is cancelled or refunded, and any bank
        transfer to your Pitchype account below is added to it.
      </p>

      {transferAccount && (
        <>
          <h2 className="mt-8 mb-3 text-display-md">
            Your bank-transfer account
          </h2>
          <TransferAccount
            bankName={transferAccount.bankName}
            accountNumber={transferAccount.accountNumber}
            accountName={transferAccount.accountName}
          />
          <p className="mt-3 text-sm text-muted">
            Send money here any time. It lands in your wallet, less the bank’s
            charge, and a hire waiting for a bank transfer is paid automatically
            once your wallet covers it.
          </p>
        </>
      )}

      <h2 className="mt-8 mb-3 text-display-md">History</h2>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} tone="lilac" title="Nothing here yet">
          Refunds, bank transfers and anything you pay from your wallet will
          show up here.
        </EmptyState>
      ) : (
        <LedgerTable
          rows={paged.items}
          footer={
            <Pagination
              framed
              {...paged}
              noun={["line", "lines"]}
              hrefFor={(page) => pagedHref("/business/wallet", {}, page)}
            />
          }
        />
      )}
    </>
  );
}
