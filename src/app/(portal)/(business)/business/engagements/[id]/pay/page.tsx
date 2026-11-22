import { CircleSlash, Clock, Landmark, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { maxClicks } from "@/lib/campaign";
import { formatDateTime } from "@/lib/creator-profile";
import { getEngagementDetails } from "@/lib/db/applications";
import { getEngagementClicks } from "@/lib/db/clicks";
import {
  getActivePaymentProvider,
  getMyDepositAccount,
  getPaymentsForEngagement,
  getWalletBalance,
} from "@/lib/db/money";
import { feeExample, transferAmountToSend } from "@/lib/fees";
import { formatNaira } from "@/lib/money";

import { TransferAccount } from "@/components/money/transfer-account";

import { CancelHireForm } from "./cancel-hire-form";
import { PayForm } from "./pay-form";
import { payView } from "./view";

export const metadata: Metadata = { title: "Pay to start" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ transfer?: string }>;

export default function PayPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <div className="max-w-2xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the hire…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={5} />
          </PageLoading>
        }
      >
        <Pay params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Shows exactly what will be charged, with the wallet applied first, and the
// hire lapses after 48 hours (CLAUDE.md §6.1, §6.2, §6.3). The wallet is
// read for the signed-in business only; the server works the amounts out
// again when the payment starts.
async function Pay({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireRole("business");
  const { id } = await params;
  const { transfer } = await searchParams;
  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();
  const view = payView(engagement, new Date());
  // A hire that was ever paid (Back from Paystack, a stale tab, an old
  // notification) belongs on its hire page; this page would say "nothing was
  // charged". redirect() throws, so it stays outside any try block.
  if (view === "paid") redirect(`/business/engagements/${engagement.id}`);

  const fees = feeExample(engagement.agreedPriceKobo);
  // Non-null for a per-click hire: the budget pays for clicks, and the fee is
  // kept only on what's spent.
  const clicks = await getEngagementClicks(engagement.id);
  const walletKobo = await getWalletBalance(user.id, "business_wallet");
  const walletAppliedKobo = Math.min(walletKobo, fees.businessPaysKobo);
  const cardAmountKobo = fees.businessPaysKobo - walletAppliedKobo;
  const waiting = view === "waiting";
  // Bank transfer is offered while Cray is the active provider.
  const bankTransferAvailable = (await getActivePaymentProvider()) === "cray";
  // After choosing bank transfer: show where to send the money, but only for a
  // transfer payment that is really waiting (never on a bare ?transfer=1).
  const waitingTransfer =
    waiting && transfer === "1"
      ? (await getPaymentsForEngagement(engagement.id)).find(
          (p) => p.method === "transfer" && p.status === "initiated",
        )
      : undefined;
  const transferAccount = waitingTransfer ? await getMyDepositAccount() : null;
  const applicationsHref = `/business/campaigns/${engagement.campaign.id}/applications`;

  return (
    <>
      <PageHeader
        title={waiting ? "Pay to start the job" : "This hire has ended"}
        crumbs={[
          { href: "/business/board", label: "Hiring board" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
          { href: applicationsHref, label: "Applications" },
        ]}
        lead={`${engagement.creator.name}, for “${engagement.campaign.title}”.`}
      />

      {waiting ? (
        <>
          <dl className="space-y-3 rounded-card panel p-5 sm:p-6">
            <div className="flex justify-between gap-4">
              <dt>
                {clicks
                  ? `Budget: up to ${maxClicks(clicks.capKobo, clicks.cpcKobo).toLocaleString("en-NG")} clicks at ${formatNaira(clicks.cpcKobo)} (held by Pitchype)`
                  : "Agreed price (held by Pitchype until the job is done)"}
              </dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.agreedPriceKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Our fee</dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.businessFeeKobo)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hairline pt-3 text-lg">
              <dt className="font-semibold text-ink">
                {walletAppliedKobo > 0 ? "Total" : "You pay"}
              </dt>
              <dd className="font-semibold text-ink tabular-nums">
                {formatNaira(fees.businessPaysKobo)}
              </dd>
            </div>
            {walletAppliedKobo > 0 && (
              <>
                <div className="flex justify-between gap-4">
                  <dt>From your wallet</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    −{formatNaira(walletAppliedKobo)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 text-lg">
                  <dt className="font-semibold text-ink">
                    {cardAmountKobo === 0
                      ? "To pay by card"
                      : "You pay by card"}
                  </dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {formatNaira(cardAmountKobo)}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="mt-4 space-y-3">
            <Callout tone="attention" icon={Clock} title="Pay within 48 hours">
              Pay by {formatDateTime(engagement.payBy)} (Lagos time), or the
              hire lapses and the place goes back on offer.
            </Callout>
            {clicks ? (
              <Callout tone="info" icon={Lock} title="You pay only for clicks">
                After the campaign, you pay for the clicks counted. The rest of
                the budget comes back to your wallet. We keep 5% of what’s
                spent, at least ₦500 or the card charge.
              </Callout>
            ) : (
              <Callout tone="info" icon={Lock} title="Our fee isn’t refundable">
                If you cancel after paying, before work starts, you get the{" "}
                {formatNaira(fees.agreedPriceKobo)} back, not the{" "}
                {formatNaira(fees.businessFeeKobo)} fee.
              </Callout>
            )}
          </div>

          {waitingTransfer && (
            <div className="mt-4 space-y-3">
              <Callout
                tone="info"
                icon={Landmark}
                title={`Send ${formatNaira(transferAmountToSend(cardAmountKobo))} by bank transfer`}
              >
                That’s {formatNaira(cardAmountKobo)} for this hire plus up to
                ₦200 for the bank-transfer charge. Anything the charge doesn’t
                use stays in your Pitchype wallet. If you send a different
                amount it also goes into your wallet, and we’ll tell you what’s
                left to pay. This page updates when the money arrives.
              </Callout>
              {transferAccount ? (
                <TransferAccount
                  bankName={transferAccount.bankName}
                  accountNumber={transferAccount.accountNumber}
                  accountName={transferAccount.accountName}
                />
              ) : (
                <Callout tone="attention" icon={Clock} title="Almost ready">
                  We’re still setting up your transfer account. Refresh in a
                  minute.
                </Callout>
              )}
            </div>
          )}

          <PayForm
            engagementId={engagement.id}
            cardAmountKobo={cardAmountKobo}
            perClick={clicks !== null}
            bankTransferAvailable={bankTransferAvailable}
          />

          <CancelHireForm engagementId={engagement.id} />
        </>
      ) : (
        <Callout
          tone="info"
          icon={CircleSlash}
          title={
            view === "cancelled"
              ? "You cancelled this hire"
              : "This hire lapsed"
          }
          action={
            <Link
              href={applicationsHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Back to applications
            </Link>
          }
        >
          {view === "cancelled"
            ? "You cancelled this hire before paying. Nothing was charged, and the place went back on offer."
            : "It wasn’t paid within 48 hours, so the place went back on offer. Nothing was charged."}
        </Callout>
      )}
    </>
  );
}
