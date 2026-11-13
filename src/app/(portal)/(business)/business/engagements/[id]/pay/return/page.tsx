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

import {
  viewFromHire,
  viewFromPaystackError,
  viewFromResult,
  type ReturnView,
} from "./view";

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

  // Already recorded (by the webhook or an earlier visit): describe the
  // hire as it stands, without asking Paystack again on every reload.
  let view: ReturnView = "checking";
  if (payment.status === "succeeded") {
    view = viewFromHire(engagement, true);
  } else {
    let result: CardPaymentResult | null = null;
    try {
      result = await confirmCardPayment(payment.reference);
    } catch (error) {
      // The webhook still records the payment when Paystack answers it.
      if (!(error instanceof PaystackError)) throw error;
      view = viewFromPaystackError(error.status);
    }
    if (result === "duplicate") {
      // Recorded first by the webhook: read the state it left.
      const latest = (await getEngagementDetails(engagement.id)) ?? engagement;
      const latestPayment = (
        await getPaymentsForEngagement(engagement.id)
      ).find((p) => p.id === payment.id);
      view = viewFromResult(
        result,
        latest,
        latestPayment?.status === "succeeded",
      );
    } else if (result !== null) {
      // Only a duplicate reads the payment's stored status.
      view = viewFromResult(result, engagement, false);
    }
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

      {view === "funded" ? (
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
      ) : view === "lapsed" || view === "stranded" ? (
        <Callout
          tone="info"
          icon={Wallet}
          title={
            view === "lapsed"
              ? "Your payment arrived after this hire lapsed"
              : "Your payment couldn’t be applied to this hire"
          }
          action={
            <Link
              href={hireHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Go to the hire
            </Link>
          }
        >
          {view === "lapsed"
            ? "The money is in your Pitchype wallet; the hire was not started."
            : "The money is in your Pitchype wallet. Check the hire to see what to do next."}
        </Callout>
      ) : view === "pending" ? (
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
      ) : view === "failed" ? (
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
      ) : view === "moved_on" ? (
        <Callout
          tone="info"
          icon={CircleSlash}
          title="This hire has already moved on"
          action={
            <Link
              href={hireHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Go to the hire
            </Link>
          }
        >
          See the hire for where things stand now.
        </Callout>
      ) : (
        <Callout
          tone="attention"
          icon={SearchCheck}
          title="We’re checking this payment"
          action={
            <Link
              href={hireHref}
              className={buttonVariants({ variant: "secondary" })}
            >
              Go to the hire
            </Link>
          }
        >
          If you were charged, nothing is lost; we’ll sort it out. Contact{" "}
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
