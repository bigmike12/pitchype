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
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { confirmCardPayment, type CardPaymentResult } from "@/lib/payments";
import { CrayError } from "@/lib/cray";
import { PaystackError } from "@/lib/paystack";
import { CONTACT_EMAIL } from "@/lib/site";

import {
  returnCopy,
  viewFromHire,
  viewFromProviderError,
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

// The payment provider sends the business here after paying (the reference is
// `reference` from Cray, `reference` or `trxref` from Paystack). The page
// believes nothing in the URL except which payment to look up: it asks the
// payment's own provider, then records the result through the same function
// as the webhook (whichever comes first funds the hire; the other is a
// duplicate). CLAUDE.md §6 rule 6.
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
    (p) =>
      p.reference === reference && p.method === "card" && p.cardAmountKobo > 0,
  );
  if (!payment) notFound();

  // Already recorded (by the webhook or an earlier visit): describe the
  // hire as it stands, without asking the provider again on every reload.
  let view: ReturnView = "checking";
  if (payment.status === "succeeded") {
    view = viewFromHire(engagement, true);
  } else {
    let result: CardPaymentResult | null = null;
    try {
      result = await confirmCardPayment(payment.reference);
      // Funding or stranding writes a notification; the webhook may have done
      // it first ("duplicate"), and then this is a harmless empty run.
      sendEmailsAfterResponse();
    } catch (error) {
      // The webhook still records the payment when the provider answers it.
      if (!(error instanceof PaystackError || error instanceof CrayError)) {
        throw error;
      }
      view = viewFromProviderError(error.status);
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
          { href: "/business/board", label: "Hiring board" },
          {
            href: `/business/campaigns/${engagement.campaign.id}`,
            label: engagement.campaign.title,
          },
        ]}
        lead={`${engagement.creator.name}, for “${engagement.campaign.title}”.`}
      />

      {(() => {
        const copy = returnCopy(view, engagement.creator.name);
        const secondary = (href: string, label: string) => (
          <Link
            href={href}
            className={buttonVariants({ variant: "secondary" })}
          >
            {label}
          </Link>
        );
        if (view === "funded") {
          return (
            <Callout
              tone="success"
              icon={CircleCheck}
              title={copy.title}
              action={
                <Link href={hireHref} className={buttonVariants()}>
                  Go to the hire
                </Link>
              }
            >
              {copy.body}
            </Callout>
          );
        }
        if (view === "lapsed" || view === "stranded") {
          return (
            <Callout
              tone="info"
              icon={Wallet}
              title={copy.title}
              action={secondary(hireHref, "Go to the hire")}
            >
              {copy.body}
            </Callout>
          );
        }
        if (view === "pending") {
          return (
            <Callout
              tone="attention"
              icon={Clock}
              title={copy.title}
              action={secondary(refreshHref, "Refresh")}
            >
              {copy.body}
            </Callout>
          );
        }
        if (view === "failed") {
          return (
            <Callout
              tone="info"
              icon={CircleSlash}
              title={copy.title}
              action={
                <Link
                  href={`/business/engagements/${engagement.id}/pay`}
                  className={buttonVariants()}
                >
                  Try again
                </Link>
              }
            >
              {copy.body}
            </Callout>
          );
        }
        if (view === "moved_on") {
          return (
            <Callout
              tone="info"
              icon={CircleSlash}
              title={copy.title}
              action={secondary(hireHref, "Go to the hire")}
            >
              {copy.body}
            </Callout>
          );
        }
        return (
          <Callout
            tone="attention"
            icon={SearchCheck}
            title={copy.title}
            action={secondary(hireHref, "Go to the hire")}
          >
            {copy.body} Contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold underline"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            if this stays unresolved.
          </Callout>
        );
      })()}
    </>
  );
}
