import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  SectionTitleSkeleton,
} from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import {
  getActivePaymentProvider,
  listPaymentProviderHistory,
} from "@/lib/db/money";
import { providerName } from "@/lib/provider-words";

import { ProviderForm } from "./provider-form";

export const metadata: Metadata = { title: "Payment provider" };

export default function ProviderPage() {
  return (
    <div className="max-w-3xl">
      <Suspense
        fallback={
          <PageLoading label="Loading…">
            <HeaderSkeleton crumbs />
            <PanelSkeleton lines={2} />
            <div className="mt-8">
              <SectionTitleSkeleton />
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Provider />
      </Suspense>
    </div>
  );
}

async function Provider() {
  await requireRole("admin");
  const [active, history] = await Promise.all([
    getActivePaymentProvider(),
    listPaymentProviderHistory(20),
  ]);

  return (
    <>
      <PageHeader
        title="Payment provider"
        crumbs={[{ href: "/admin/money", label: "Money" }]}
        lead="Which provider new card payments, bank transfers and payouts start on."
      />

      <Callout
        tone="success"
        icon={CircleCheck}
        title={`New payments and payouts go through ${providerName(active)}`}
      >
        {active === "cray"
          ? "Businesses can pay by card or bank transfer."
          : "Businesses can pay by card only; bank transfer is a Cray feature."}
      </Callout>

      <div className="mt-3 space-y-3">
        <SectionCard id="switch" title="Switch provider" padded>
          <div className="mb-4 space-y-2 text-sm text-ink">
            <p>
              <strong>What it does:</strong> from now on, new card payments, the
              bank-transfer option, new payout requests and the provider that
              sends them follow the provider you choose.
            </p>
            <p>
              <strong>What it never does:</strong> change anything already
              started. A payment or payout stays on the provider it started on,
              and its webhooks, return page and checks keep going to that
              provider. Deposits into a business’s existing transfer account are
              always credited. Creators who saved bank details for the old
              provider are asked to add them again.
            </p>
          </div>
          <ProviderForm active={active} />
        </SectionCard>

        <SectionCard id="history" title="History">
          <ul className="divide-y divide-hairline">
            {history.map((change) => (
              <li
                key={`${change.createdAt}-${change.provider}`}
                className="px-4 py-3.5 sm:px-5"
              >
                <p className="font-semibold text-ink">
                  {providerName(change.provider)}
                  <span className="font-normal text-muted">
                    {" "}
                    · {formatDateTime(change.createdAt)}
                    {change.changedBy
                      ? ` · admin ${change.changedBy.slice(0, 8)}`
                      : " · default"}
                  </span>
                </p>
                <p className="mt-0.5 text-sm break-words text-ink">
                  {change.reason}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
