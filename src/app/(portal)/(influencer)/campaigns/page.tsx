import { Megaphone, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField, TextField } from "@/components/ui/field";
import {
  FilterBar,
  filterHref,
  type ActiveFilter,
} from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth";
import { PLATFORM_RULES, PLATFORMS, isPlatform } from "@/lib/creator-profile";
import { CAMPAIGNS_PAGE_SIZE, listOpenCampaigns } from "@/lib/db/campaigns";
import { listNiches } from "@/lib/db/creators";
import { pageCount, pagedHref, parsePage } from "@/lib/paging";
import { SEARCH_MAX, parseSearch } from "@/lib/search";

import { CampaignCard } from "./campaign-card";
import {
  CardGridSkeleton,
  FiltersSkeleton,
  HeaderSkeleton,
  PageLoading,
} from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Campaigns" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <>
      <Suspense
        fallback={
          <PageLoading label="Loading campaigns…">
            <HeaderSkeleton />
            <FiltersSkeleton />
            <CardGridSkeleton variant="campaign" count={6} className="mt-8" />
          </PageLoading>
        }
      >
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
  const search = parseSearch(params.q);
  const page = parsePage(params.page);

  const { campaigns, total } = await listOpenCampaigns({
    search,
    niche,
    platform,
    qualifiedOnly,
    page,
  });
  const nicheName = new Map(niches.map((n) => [n.slug, n.name]));
  const pages = pageCount(total, CAMPAIGNS_PAGE_SIZE);

  const current = {
    q: search,
    niche,
    platform,
    qualified: qualifiedOnly ? "1" : undefined,
  };
  const without = (key: keyof typeof current) =>
    filterHref("/campaigns", { ...current, [key]: undefined });
  const active: ActiveFilter[] = [];
  if (search) {
    active.push({
      label: "Search",
      value: `“${search}”`,
      href: without("q"),
    });
  }
  if (niche) {
    active.push({
      label: "Niche",
      value: nicheName.get(niche) ?? niche,
      href: without("niche"),
    });
  }
  if (platform) {
    active.push({
      label: "Platform",
      value: PLATFORM_RULES[platform].label,
      href: without("platform"),
    });
  }
  if (qualifiedOnly) {
    active.push({
      label: "Show",
      value: "Campaigns I qualify for",
      href: without("qualified"),
    });
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        lead="Paid work from businesses. Each campaign shows whether you qualify, and what to change if you don’t. Apply to the ones that fit."
      />

      <FilterBar
        action="/campaigns"
        label="Filter campaigns"
        submitLabel="Show campaigns"
        active={active}
        fieldsClassName="grid sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <TextField
          compact
          type="search"
          label="Search"
          name="q"
          icon={Search}
          placeholder="Campaign, brief or business"
          maxLength={SEARCH_MAX}
          defaultValue={search ?? ""}
          className="sm:col-span-2 lg:col-span-1"
        />
        <SelectField
          compact
          label="Niche"
          name="niche"
          placeholder="Any niche"
          options={niches.map((n) => ({ value: n.slug, label: n.name }))}
          defaultValue={niche ?? ""}
        />
        <SelectField
          compact
          label="Platform"
          name="platform"
          placeholder="Any platform"
          options={PLATFORMS.map((p) => ({
            value: p,
            label: PLATFORM_RULES[p].label,
          }))}
          defaultValue={platform ?? ""}
        />
        {user.role === "influencer" && (
          <label className="flex h-11 cursor-pointer items-center gap-2.5 self-end rounded-control border border-field bg-surface px-3.5 text-base text-ink shadow-[0_1px_2px_rgb(14_14_16/0.04)] has-[:checked]:border-ink has-[:checked]:bg-surface-soft sm:col-span-2 lg:col-span-1 lg:h-9 lg:text-sm">
            <input
              type="checkbox"
              name="qualified"
              value="1"
              defaultChecked={qualifiedOnly}
              className="size-4 accent-ink"
            />
            Only campaigns I qualify for
          </label>
        )}
      </FilterBar>

      <section aria-labelledby="results-title" className="mt-6">
        <h2 id="results-title" className="sr-only">
          Results
        </h2>
        <p
          role="status"
          // With no results the empty state says it; keep this for screen readers.
          className={total === 0 ? "sr-only" : "text-sm font-semibold text-ink"}
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
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={CAMPAIGNS_PAGE_SIZE}
          noun={["campaign", "campaigns"]}
          hrefFor={(to) => pagedHref("/campaigns", current, to)}
        />
      </section>
    </>
  );
}
