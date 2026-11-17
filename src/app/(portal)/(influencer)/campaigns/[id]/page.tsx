import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  MapPin,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  DeliverableList,
  RequirementList,
  StatusPill,
} from "@/components/campaigns/campaign-facts";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { requireUser } from "@/lib/auth";
import { creatorReceivesKobo, formatDay, problemText } from "@/lib/campaign";
import { formatDate } from "@/lib/creator-profile";
import { listMyApplications } from "@/lib/db/applications";
import { getCampaign } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { formatNaira } from "@/lib/money";
import { stateLabel } from "@/lib/profile";

import { ApplicationPanel } from "./application-panel";
import { ApplyForm } from "./apply-form";
import { CampaignReportForm } from "./report-form";
import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Campaign" };

type Params = Promise<{ id: string }>;

export default function CampaignPage({ params }: { params: Params }) {
  return (
    <div className="max-w-6xl">
      <Suspense
        fallback={
          <PageLoading label="Loading the campaign…">
            <HeaderSkeleton crumbs />
            <div className="space-y-4">
              <PanelSkeleton lines={2} />
              <PanelSkeleton lines={4} />
            </div>
          </PageLoading>
        }
      >
        <Campaign params={params} />
      </Suspense>
    </div>
  );
}

async function Campaign({ params }: { params: Params }) {
  const user = await requireUser();
  if (user.role === "business") redirect("/business/campaigns");
  const { id } = await params;
  // Creators get it only while open; admins always (for review).
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const isCreator = user.role === "influencer";
  const [niches, myApplications] = await Promise.all([
    listNiches(),
    isCreator ? listMyApplications() : Promise.resolve([]),
  ]);
  const application = myApplications.find((a) => a.campaign.id === campaign.id);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const nicheNames = campaign.niches.flatMap((s) => nicheName.get(s) ?? []);
  const qualifies = campaign.problems.length === 0;

  return (
    <>
      <PageHeader
        title={campaign.title}
        crumbs={[
          isCreator
            ? { href: "/campaigns", label: "Campaigns" }
            : { href: "/admin", label: "Admin" },
        ]}
        badge={
          !isCreator && (
            <StatusPill
              status={campaign.status}
              takenDown={Boolean(campaign.removedReason)}
            />
          )
        }
        lead={
          <span className="flex items-center gap-1.5 text-base text-muted">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {campaign.businessName}, {campaign.businessCity},{" "}
            {stateLabel(campaign.businessState)}
          </span>
        }
      />

      <div className="mt-6 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3 xl:order-2 xl:sticky xl:top-0">
          <dl className="grid gap-4 rounded-card p-4 panel sm:grid-cols-3 sm:p-5 xl:grid-cols-1">
            {campaign.priceKobo !== null && (
              <div>
                <dt className="text-sm text-muted">Pay per creator</dt>
                <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                  {formatNaira(campaign.priceKobo)}
                </dd>
                <dd className="mt-1.5 text-[0.8125rem] text-muted">
                  You receive{" "}
                  {formatNaira(creatorReceivesKobo(campaign.priceKobo))} after
                  our 5% fee
                </dd>
              </div>
            )}
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <Users className="size-4" aria-hidden="true" />
                Creators
              </dt>
              <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                {campaign.places}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="size-4" aria-hidden="true" />
                Applications close
              </dt>
              <dd className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                {formatDay(campaign.applicationsCloseOn)}
              </dd>
            </div>
          </dl>

          {isCreator &&
            (application ? (
              <ApplicationPanel application={application} />
            ) : qualifies && campaign.priceKobo !== null ? (
              <section
                aria-labelledby="apply-title"
                className="rounded-card p-4 panel sm:p-5"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <BadgeCheck
                    className="size-4 text-brand-green"
                    aria-hidden="true"
                  />
                  You qualify for this campaign
                </p>
                <h2 id="apply-title" className="mt-2 mb-5 text-display-md">
                  Apply
                </h2>
                <ApplyForm
                  campaignId={campaign.id}
                  campaignPriceKobo={campaign.priceKobo}
                />
              </section>
            ) : (
              <Callout
                tone="info"
                icon={CircleAlert}
                title="You don’t qualify yet"
                action={
                  <Link href="/profile" className="link">
                    Update your profile
                  </Link>
                }
              >
                <ul className="list-disc space-y-1 pl-5">
                  {campaign.problems.map((p, i) => (
                    <li key={i}>
                      {problemText(p, { nicheNames, states: campaign.states })}
                    </li>
                  ))}
                </ul>
              </Callout>
            ))}
        </div>
        <div className="space-y-3 xl:order-1">
          <SectionCard id="posts-title" title="What you post" padded>
            <div>
              <DeliverableList
                deliverables={campaign.deliverables}
                postFrom={campaign.postFrom}
                deliverBy={campaign.deliverBy}
              />
            </div>
          </SectionCard>

          <SectionCard id="who-title" title="Who can apply" padded>
            <div>
              <RequirementList
                platforms={campaign.platforms}
                verifiedOnly={campaign.verifiedOnly}
                nicheNames={nicheNames}
                states={campaign.states}
                problems={isCreator ? campaign.problems : undefined}
              />
            </div>
          </SectionCard>

          <SectionCard id="brief-title" title="Brief" padded>
            {campaign.revisedAt && (
              <p className="mt-2 text-sm text-muted">
                Edited {formatDate(campaign.revisedAt)}
              </p>
            )}
            <p className="max-w-[65ch] whitespace-pre-line">{campaign.brief}</p>
            {campaign.guidelines && (
              <>
                <h3 className="mt-6 font-semibold text-ink">
                  Notes from the business
                </h3>
                <p className="mt-1 max-w-[65ch] whitespace-pre-line">
                  {campaign.guidelines}
                </p>
              </>
            )}
          </SectionCard>

          {isCreator && (
            <div className="max-w-xl pt-6">
              <CampaignReportForm campaignId={campaign.id} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
