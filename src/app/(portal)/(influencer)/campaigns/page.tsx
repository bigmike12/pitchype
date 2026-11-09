import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { PLATFORM_RULES, PLATFORMS, isPlatform } from "@/lib/creator-profile";
import { CAMPAIGNS_PAGE_SIZE, listOpenCampaigns } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";

import { CampaignCard } from "./campaign-card";

export const metadata: Metadata = { title: "Campaigns" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <Suspense fallback={<LoadingNotice>Loading campaigns…</LoadingNotice>}>
        <Campaigns searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

async function Campaigns({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  if (user.role === "business") redirect("/business/campaigns");

  const [params, niches] = await Promise.all([searchParams, listNiches()]);
  const niche = niches.some((n) => n.slug === first(params.niche))
    ? first(params.niche)
    : undefined;
  const platformParam = first(params.platform);
  const platform = isPlatform(platformParam) ? platformParam : undefined;
  const qualifiedOnly = first(params.qualified) === "1";
  const pageParam = Number(first(params.page));
  const page =
    Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 1000
      ? pageParam
      : 1;

  const { campaigns, total } = await listOpenCampaigns({
    niche,
    platform,
    qualifiedOnly,
    page,
  });
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const pages = Math.max(1, Math.ceil(total / CAMPAIGNS_PAGE_SIZE));
  const query = (to: number) => {
    const q = new URLSearchParams();
    if (niche) q.set("niche", niche);
    if (platform) q.set("platform", platform);
    if (qualifiedOnly) q.set("qualified", "1");
    if (to > 1) q.set("page", String(to));
    const s = q.toString();
    return s ? `/campaigns?${s}` : "/campaigns";
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        lead="Paid work from businesses. Each campaign shows whether you qualify, and what to change if you don’t. Applying opens soon."
      />

      <form
        method="get"
        action="/campaigns"
        aria-label="Filter campaigns"
        className="rounded-card bg-white p-4 ring-1 ring-hairline sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Niche"
            name="niche"
            placeholder="Any niche"
            options={niches.map((n) => ({ value: n.slug, label: n.name }))}
            defaultValue={niche ?? ""}
          />
          <SelectField
            label="Platform"
            name="platform"
            placeholder="Any platform"
            options={PLATFORMS.map((p) => ({
              value: p,
              label: PLATFORM_RULES[p].label,
            }))}
            defaultValue={platform ?? ""}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {user.role === "influencer" && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-ink">
              <input
                type="checkbox"
                name="qualified"
                value="1"
                defaultChecked={qualifiedOnly}
                className="size-5 accent-ink"
              />
              Only campaigns I qualify for
            </label>
          )}
          <Button type="submit">Show campaigns</Button>
          {(niche || platform || qualifiedOnly) && (
            <Link href="/campaigns" className="link text-sm font-medium">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <section aria-labelledby="results-title" className="mt-10">
        <h2 id="results-title" className="sr-only">
          Results
        </h2>
        <p
          role="status"
          // With no results the empty state says it; keep this for screen readers.
          className={total === 0 ? "sr-only" : "font-semibold text-ink"}
        >
          {total === 0
            ? "No open campaigns match."
            : total === 1
              ? "1 open campaign"
              : `${total.toLocaleString("en-NG")} open campaigns`}
        </p>
        {total === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon={Megaphone}
              tone="lilac"
              title="No open campaigns match"
              action={
                <Link
                  href="/profile"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Update your profile
                </Link>
              }
            >
              New campaigns appear here as businesses publish them. Meanwhile,
              keep your profile up to date so you qualify for more.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="grid">
                <CampaignCard
                  campaign={campaign}
                  nicheNames={campaign.niches.flatMap(
                    (s) => nicheName.get(s) ?? [],
                  )}
                />
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav
            aria-label="Pages"
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            {page > 1 && (
              <Link
                href={query(page - 1)}
                rel="prev"
                className={buttonVariants({ variant: "secondary" })}
              >
                Previous
              </Link>
            )}
            <p className="text-sm text-muted">
              Page {page} of {pages}
            </p>
            {page < pages && (
              <Link
                href={query(page + 1)}
                rel="next"
                className={buttonVariants({ variant: "secondary" })}
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
