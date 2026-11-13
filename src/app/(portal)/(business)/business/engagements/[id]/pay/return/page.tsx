import {
  CircleCheck,
  CircleSlash,
  Clock,
  SearchCheck,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getEngagementDetails } from "@/lib/db/applications";
import { getPaymentsForEngagement } from "@/lib/db/money";
import { confirmCardPayment, type CardPaymentResult } from "@/lib/payments";
import { PaystackError } from "@/lib/paystack";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Payment" };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ reference?: string; trxref?: string }>;

export default function PaymentReturnPage({
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
          <PageLoading label="Checking your payment…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={3} />
          </PageLoading>
        }
      >
        <PaymentReturn params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Paystack sends the business here after paying. The page believes nothing
// in the URL except which payment to look up: it asks Paystack, then records
// the result through the same function as the webhook (whichever comes first
// funds the hire; the other is a duplicate). CLAUDE.md §6 rule 6.
async function PaymentReturn({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireRole("business");
  const { id } = await params;
  const query = await searchParams;
  const reference =
    typeof query.reference === "string" ? query.reference : query.trxref;

  const engagement = await getEngagementDetails(id);
  if (!engagement || engagement.business.id !== user.id) notFound();
  if (typeof reference !== "string") notFound();
  const payments = await getPaymentsForEngagement(engagement.id);
  const payment = payments.find(
    (p) => p.reference === reference && p.cardAmountKobo > 0,
  );
  if (!payment) notFound();

  let result: CardPaymentResult | "unreachable";
  try {
    result = await confirmCardPayment(payment.reference);
  } catch (error) {
    // Paystack didn't answer; the webhook will still record the payment.
    if (!(error instanceof PaystackError)) throw error;
    result = "unreachable";
  }

  // A duplicate means the webhook (or an earlier visit) recorded it first.
  let funded = result === "funded";
  let stranded = result === "stranded";
  if (result === "duplicate") {
    const latest = await getEngagementDetails(engagement.id);
    const status = latest?.status ?? engagement.status;
    funded = status !== "awaiting_payment" && status !== "cancelled";
    stranded = status === "cancelled";
  }

  const hireHref = `/business/engagements/${engagement.id}`;
  const refreshHref = `/business/engagements/${engagement.id}/pay/return?reference=${encodeURIComponent(payment.reference)}`;

  return (
    <>
      <PageHeader
        title="Payment"
        crumbs={[
          { href: "/business/campaigns", label: "Campaigns" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
        ]}
        lead={`${engagement.creator.name}, for “${engagement.campaign.title}”.`}
      />

      {funded ? (
        <Callout
          tone="success"
          icon={CircleCheck}
          title={`Payment received. ${engagement.creator.name} can now start`}
          action={
            <Link href={hireHref} className={buttonVariants()}>
              Go to the hire
            </Link>
          }
        >
          The money is held in escrow until you accept the work.
        </Callout>
      ) : stranded ? (
        <Callout
          tone="info"
          icon={Wallet}
          title="Your payment arrived after this hire lapsed"
          action={
            <Link
              href={hireHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Go to the hire
            </Link>
          }
        >
          The money is in your Pitchype wallet; the hire was not started.
        </Callout>
      ) : result === "pending" || result === "unreachable" ? (
        <Callout
          tone="attention"
          icon={Clock}
          title="Your payment is still being confirmed"
          action={
            <Link
              href={refreshHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Refresh
            </Link>
          }
        >
          This page will not change by itself; refresh in a minute.
        </Callout>
      ) : result === "failed" ? (
        <Callout
          tone="info"
          icon={CircleSlash}
          title="The payment didn’t go through"
          action={
            <Link
              href={`/business/engagements/${engagement.id}/pay`}
              className={buttonVariants()}
            >
              Try again
            </Link>
          }
        >
          Nothing was charged to the hire.
        </Callout>
      ) : (
        <Callout
          tone="attention"
          icon={SearchCheck}
          title="We received your payment and are checking it"
          action={
            <Link
              href={hireHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Go to the hire
            </Link>
          }
        >
          Nothing is lost; we’ll sort it out. Contact{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-semibold underline"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          if this stays unresolved.
        </Callout>
      )}
    </>
  );
}
