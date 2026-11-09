import { CircleAlert, Clock, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import {
  DeliverableList,
  RequirementList,
  StatusPill,
} from "@/components/campaigns/campaign-facts";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDay, maxSpend, type CampaignAction } from "@/lib/campaign";
import { formatDateTime } from "@/lib/creator-profile";
import {
  countQualifyingCreators,
  getOwnCampaign,
  isTrustedBusiness,
  type OwnCampaign,
} from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { formatNaira } from "@/lib/money";

import { deleteDraftAction } from "../actions";
import { CampaignActions } from "./campaign-actions";

export const metadata: Metadata = { title: "Campaign" };

type Params = Promise<{ id: string }>;

export default function CampaignPage({ params }: { params: Params }) {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<LoadingNotice>Loading the campaign…</LoadingNotice>}>
        <Campaign params={params} />
      </Suspense>
    </div>
  );
}

async function Campaign({ params }: { params: Params }) {
  const user = await requireRole("business");
  const { id } = await params;
  const campaign = await getOwnCampaign(user.id, id);
  if (!campaign) notFound();

  const live = ["draft", "pending_review", "open", "paused"].includes(
    campaign.status,
  );
  const [niches, trusted, qualifying] = await Promise.all([
    listNiches(),
    campaign.status === "draft"
      ? isTrustedBusiness(user.id)
      : Promise.resolve(true),
    live ? countQualifyingCreators(campaign.id) : Promise.resolve(null),
  ]);
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const spend = maxSpend(campaign.priceKobo, campaign.places);

  return (
    <>
      <Link href="/business/campaigns" className="link text-sm font-medium">
        Your campaigns
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-display-lg">{campaign.title}</h1>
        <StatusPill
          status={campaign.status}
          takenDown={Boolean(campaign.removedReason)}
        />
      </div>

      <StatusNotice campaign={campaign} trusted={trusted} />

      <div className="mt-6 flex flex-wrap items-start gap-3">
        <CampaignActions
          campaignId={campaign.id}
          choices={choicesFor(campaign, trusted)}
        />
        {["draft", "open", "paused"].includes(campaign.status) && (
          <Link
            href={`/business/campaigns/${campaign.id}/edit`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {campaign.status === "draft"
              ? "Edit draft"
              : "Edit wording, places or dates"}
          </Link>
        )}
        {campaign.status === "draft" && !campaign.publishedAt && (
          <form action={deleteDraftAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <Button type="submit" variant="ghost" className="text-danger">
              Delete draft
            </Button>
          </form>
        )}
      </div>

      <dl className="mt-10 grid gap-4 rounded-card bg-surface-card p-5 sm:grid-cols-3 sm:p-6">
        {qualifying !== null && (
          <div>
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              <Users className="size-4" aria-hidden="true" />
              Creators who qualify now
            </dt>
            <dd className="mt-1 text-display-md">
              {qualifying.toLocaleString("en-NG")}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-muted">Per creator, with our fee</dt>
          <dd className="mt-1 text-display-md">
            {formatNaira(spend.perCreatorKobo)}
          </dd>
          <dd className="text-sm text-muted">
            {formatNaira(campaign.priceKobo)} +{" "}
            {formatNaira(spend.feePerCreatorKobo)} fee
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            Most you could spend ({campaign.places}{" "}
            {campaign.places === 1 ? "creator" : "creators"})
          </dt>
          <dd className="mt-1 text-display-md">
            {formatNaira(spend.totalKobo)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-sm text-muted">
        Nothing is charged now. You pay for each creator when you accept them.
      </p>
      {qualifying === 0 && live && (
        <p className="mt-4 flex gap-2 rounded-card bg-brand-sun p-4 text-sm text-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          No listed creator meets every requirement yet. Lower the follower
          minimums, allow more niches or states, or turn off “verified creators
          only” to reach more.
        </p>
      )}

      <section aria-labelledby="posts-title" className="mt-10">
        <h2 id="posts-title" className="text-display-md">
          What each creator posts
        </h2>
        <div className="mt-4">
          <DeliverableList
            deliverables={campaign.deliverables}
            postFrom={campaign.postFrom}
            deliverBy={campaign.deliverBy}
          />
        </div>
      </section>

      <section aria-labelledby="who-title" className="mt-10">
        <h2 id="who-title" className="text-display-md">
          Who can apply
        </h2>
        <div className="mt-4">
          <RequirementList
            platforms={campaign.platforms}
            verifiedOnly={campaign.verifiedOnly}
            nicheNames={campaign.niches.flatMap((s) => nicheName.get(s) ?? [])}
            states={campaign.states}
          />
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Clock className="size-4" aria-hidden="true" />
          Applications close at the end of{" "}
          {formatDay(campaign.applicationsCloseOn)} (Lagos time).
        </p>
      </section>

      <section aria-labelledby="brief-title" className="mt-10">
        <h2 id="brief-title" className="text-display-md">
          Brief
        </h2>
        <p className="mt-3 max-w-[65ch] whitespace-pre-line">
          {campaign.brief}
        </p>
        {campaign.guidelines && (
          <>
            <h3 className="mt-6 font-semibold text-ink">Notes for creators</h3>
            <p className="mt-1 max-w-[65ch] whitespace-pre-line">
              {campaign.guidelines}
            </p>
          </>
        )}
        {campaign.revisions.length > 1 && (
          <p className="mt-4 text-sm text-muted">
            Wording changed {campaign.revisions.length - 1}{" "}
            {campaign.revisions.length === 2 ? "time" : "times"} since it was
            first submitted, most recently{" "}
            {formatDateTime(
              campaign.revisions[campaign.revisions.length - 1].createdAt,
            )}
            . Creators see that it was edited.
          </p>
        )}
      </section>
    </>
  );
}

function StatusNotice({
  campaign,
  trusted,
}: {
  campaign: OwnCampaign;
  trusted: boolean;
}) {
  if (campaign.removedReason) {
    return (
      <p className="mt-6 rounded-card bg-surface-card p-4 text-ink">
        <strong>Taken down by Pitchype:</strong> “{campaign.removedReason}”.
        Creators can no longer see it.
      </p>
    );
  }
  if (campaign.status === "draft" && campaign.reviewNote) {
    return (
      <p className="mt-6 rounded-card bg-brand-sun p-4 text-ink">
        <strong>Sent back by Pitchype:</strong> “{campaign.reviewNote}”. Edit
        the draft, then submit it again.
      </p>
    );
  }
  if (campaign.status === "draft") {
    return (
      <p className="mt-6 text-muted">
        {trusted
          ? "Only you can see this draft. Publishing makes it visible to creators straight away."
          : "Only you can see this draft. We check a business’s first campaign before it goes live, usually within a working day."}
      </p>
    );
  }
  if (campaign.status === "pending_review") {
    return (
      <p className="mt-6 rounded-card bg-surface-card p-4 text-ink">
        We’re checking your first campaign, usually within a working day. To
        change it, withdraw it first.
      </p>
    );
  }
  if (campaign.status === "paused") {
    return (
      <p className="mt-6 text-muted">
        Paused: creators can’t see it until you resume.
      </p>
    );
  }
  if (campaign.status === "open") {
    return (
      <p className="mt-6 text-muted">Live: creators who qualify can see it.</p>
    );
  }
  return null;
}

function choicesFor(
  campaign: OwnCampaign,
  trusted: boolean,
): {
  action: CampaignAction;
  label: string;
  variant?: "default" | "secondary" | "ghost";
}[] {
  switch (campaign.status) {
    case "draft":
      return [
        { action: "submit", label: trusted ? "Publish" : "Submit for review" },
      ];
    case "pending_review":
      return [
        { action: "withdraw", label: "Withdraw to edit", variant: "secondary" },
      ];
    case "open":
      return [
        { action: "pause", label: "Pause", variant: "secondary" },
        { action: "close", label: "Close campaign", variant: "ghost" },
      ];
    case "paused":
      return [
        { action: "resume", label: "Resume" },
        { action: "close", label: "Close campaign", variant: "ghost" },
      ];
    default:
      return [];
  }
}
