import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { LedgerTable } from "@/components/money/ledger-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { getWalletBalance, listMyLedger } from "@/lib/db/money";
import { formatNaira } from "@/lib/money";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
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
        <WalletContent />
      </Suspense>
    </div>
  );
}

async function WalletContent() {
  const user = await requireRole("business");
  // The balance is read with the secret-key client, so the id is the signed-in
  // person's, never anything from the request.
  const [balanceKobo, ledger] = await Promise.all([
    getWalletBalance(user.id, "business_wallet"),
    listMyLedger(50),
  ]);
  const rows = ledger.filter((row) => row.account === "business_wallet");

  return (
    <>
      <PageHeader title="Wallet" />

      <section
        aria-labelledby="balance"
        className="rounded-card panel p-5 sm:p-6"
      >
        <h2 id="balance" className="text-sm font-medium text-muted">
          Your balance
        </h2>
        <p className="mt-1 text-display-md tabular-nums">
          {formatNaira(balanceKobo)}
        </p>
        <p className="mt-3">
          Money comes back here when a hire is cancelled or refunded. It’s used
          first when you pay for your next hire.
        </p>
      </section>

      <h2 className="mt-8 mb-3 text-display-md">History</h2>
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} tone="lilac" title="Nothing here yet">
          Refunds and anything you pay from your wallet will show up here.
        </EmptyState>
      ) : (
        <LedgerTable rows={rows} />
      )}
    </>
  );
}
