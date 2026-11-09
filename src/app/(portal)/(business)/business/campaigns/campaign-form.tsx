"use client";

import { Plus, Trash2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  controlClasses,
  FieldMessages,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import {
  BRIEF_MAX,
  DELIVERABLE_KINDS,
  GUIDELINES_MAX,
  MAX_CAMPAIGN_NICHES,
  MAX_DELIVERABLE_LINES,
  MAX_PLACES,
  MAX_QUANTITY,
  MIN_PRICE_NAIRA,
  kindLabel,
  maxSpend,
  type CampaignInput,
} from "@/lib/campaign";
import {
  MIN_FOLLOWER_LABELS,
  PLATFORM_RULES,
  PLATFORMS,
  isPlatform,
  type FollowerRange,
  type Platform,
} from "@/lib/creator-profile";
import type { Niche } from "@/lib/db/creators";
import { formatNaira, KOBO_PER_NAIRA } from "@/lib/money";
import { NIGERIAN_STATES, stateLabel } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { saveCampaignAction, type CampaignFormState } from "./actions";

type Row = { key: number; platform: string; kind: string; quantity: string };

const MIN_OPTIONS = Object.entries(MIN_FOLLOWER_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

/** Create a campaign, or edit one that is still a draft. */
export function CampaignForm({
  niches,
  today,
  campaign,
}: {
  niches: Niche[];
  today: string;
  /** The draft being edited; omitted for a new campaign. */
  campaign?: CampaignInput & { id: string };
}) {
  const [state, formAction, pending] = useActionState<
    CampaignFormState,
    FormData
  >(saveCampaignAction, { status: "idle" });
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  const [rows, setRows] = useState<Row[]>(() =>
    campaign
      ? campaign.deliverables.map((d, i) => ({
          key: i,
          platform: d.platform,
          kind: d.kind,
          quantity: String(d.quantity),
        }))
      : [{ key: 0, platform: "instagram", kind: "reel", quantity: "1" }],
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const [chosenNiches, setChosenNiches] = useState<string[]>(
    campaign?.niches ?? [],
  );
  const [where, setWhere] = useState(
    campaign && campaign.states.length > 0 ? "states" : "anywhere",
  );
  const [states, setStates] = useState<string[]>(campaign?.states ?? []);
  const [price, setPrice] = useState(
    campaign
      ? (campaign.priceKobo / KOBO_PER_NAIRA).toLocaleString("en-NG")
      : "",
  );
  const [places, setPlaces] = useState(
    campaign ? String(campaign.places) : "1",
  );

  const usedPlatforms = PLATFORMS.filter((p) =>
    rows.some((r) => r.platform === p),
  );
  const minFor = (platform: Platform): FollowerRange | "" =>
    campaign?.platforms.find((p) => p.platform === platform)?.minFollowers ??
    "";

  function updateRow(key: number, change: Partial<Row>) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...change };
        // A new platform may not have the old type (no stories on X).
        if (change.platform && isPlatform(change.platform)) {
          const kinds = DELIVERABLE_KINDS[change.platform] as readonly string[];
          if (!kinds.includes(next.kind)) next.kind = kinds[0];
        }
        return next;
      }),
    );
  }

  return (
    <form
      action={formAction}
      // Submit by hand: React resets a form after its action, and the inputs
      // this form controls (deliverable lines, states, niches) would show
      // their first values again while React still holds the new ones. The
      // next save would then send the stale ones.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-12"
      noValidate
    >
      {campaign && (
        <input type="hidden" name="campaignId" value={campaign.id} />
      )}

      <section aria-labelledby="basics-title" className="space-y-5">
        <h2 id="basics-title" className="text-display-md">
          The campaign
        </h2>
        <TextField
          label="Title"
          name="title"
          required
          maxLength={100}
          hint="What creators see first, e.g. “Launch our new zobo flavour”."
          defaultValue={values.title ?? campaign?.title}
          error={errors.title}
        />
        <TextAreaField
          label="Brief"
          name="brief"
          rows={6}
          maxLength={BRIEF_MAX}
          hint="What you’re promoting, who it’s for, and what a great post looks like."
          defaultValue={values.brief ?? campaign?.brief}
          error={errors.brief}
        />
        <TextAreaField
          label="Notes for creators"
          optional
          name="guidelines"
          rows={3}
          maxLength={GUIDELINES_MAX}
          hint="Tone, mentions and hashtags. No phone numbers or emails: creators talk to you on Pitchype."
          defaultValue={values.guidelines ?? campaign?.guidelines ?? ""}
          error={errors.guidelines}
        />
      </section>

      <section aria-labelledby="deliverables-title">
        <h2 id="deliverables-title" className="text-display-md">
          What each creator posts
        </h2>
        <p className="mt-2 text-muted">
          Locked once the campaign is live, so creators know exactly what they
          agreed to.
        </p>
        <ul className="mt-5 space-y-3">
          {rows.map((row, index) => {
            const kinds = isPlatform(row.platform)
              ? DELIVERABLE_KINDS[row.platform]
              : [];
            const line = index + 1;
            return (
              <li
                key={row.key}
                className="grid grid-cols-[1fr_1fr] gap-3 rounded-card bg-white p-3 ring-1 ring-hairline sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-center"
              >
                <select
                  name="deliverablePlatform"
                  aria-label={`Platform, line ${line}`}
                  value={row.platform}
                  onChange={(e) =>
                    updateRow(row.key, { platform: e.target.value })
                  }
                  className={controlClasses({})}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_RULES[p].label}
                    </option>
                  ))}
                </select>
                <select
                  name="deliverableKind"
                  aria-label={`Type, line ${line}`}
                  value={row.kind}
                  onChange={(e) => updateRow(row.key, { kind: e.target.value })}
                  className={controlClasses({})}
                >
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k, 2)}
                    </option>
                  ))}
                </select>
                <input
                  name="deliverableQuantity"
                  aria-label={`How many, line ${line}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  value={row.quantity}
                  onChange={(e) =>
                    updateRow(row.key, { quantity: e.target.value })
                  }
                  className={controlClasses({})}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((r) => r.key !== row.key),
                    )
                  }
                  className="justify-self-start text-danger"
                >
                  <Trash2 aria-hidden="true" />
                  Remove<span className="sr-only"> line {line}</span>
                </Button>
              </li>
            );
          })}
        </ul>
        <FieldMessages id="deliverables" error={errors.deliverables} />
        {rows.length < MAX_DELIVERABLE_LINES && (
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setRows((current) => [
                ...current,
                {
                  key: nextKey,
                  platform: "instagram",
                  kind: "story",
                  quantity: "1",
                },
              ]);
              setNextKey((k) => k + 1);
            }}
          >
            <Plus aria-hidden="true" />
            Add a line
          </Button>
        )}
      </section>

      <section aria-labelledby="who-title" className="space-y-6">
        <h2 id="who-title" className="text-display-md">
          Who can apply
        </h2>

        {usedPlatforms.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {usedPlatforms.map((platform) => (
              <SelectField
                key={platform}
                id={`min-${platform}`}
                label={`${PLATFORM_RULES[platform].label} followers`}
                name={`minFollowers.${platform}`}
                placeholder="Any number"
                options={MIN_OPTIONS}
                defaultValue={minFor(platform)}
                error={errors.minFollowers}
              />
            ))}
          </div>
        )}
        <p className="-mt-2 text-sm text-muted">
          Creators need an account on every platform above, with at least that
          many followers.
        </p>

        <label className="flex cursor-pointer items-start gap-3 rounded-card bg-white p-4 ring-1 ring-hairline">
          <input
            type="checkbox"
            name="verifiedOnly"
            defaultChecked={campaign?.verifiedOnly}
            className="mt-1 size-5 accent-ink"
          />
          <span>
            <span className="block font-semibold text-ink">
              Verified creators only
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              Only creators whose accounts we’ve checked. Few are verified yet,
              so fewer will qualify.
            </span>
          </span>
        </label>

        <fieldset
          aria-describedby={errors.niches ? "niches-error" : "niches-hint"}
        >
          <legend className="font-semibold text-ink">
            Niches <span className="font-normal text-muted">(optional)</span>
          </legend>
          <p id="niches-hint" className="mt-1 text-sm text-muted">
            Up to {MAX_CAMPAIGN_NICHES}. Creators in any of them can apply.
            Choose none for any niche.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {niches.map((niche) => {
              const checked = chosenNiches.includes(niche.slug);
              const full =
                !checked && chosenNiches.length >= MAX_CAMPAIGN_NICHES;
              return (
                <label
                  key={niche.slug}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full border border-field bg-white px-4 text-sm font-medium text-ink",
                    "has-checked:border-ink has-checked:bg-ink has-checked:text-white",
                    "has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink",
                    full
                      ? "cursor-not-allowed opacity-50"
                      : "not-has-checked:hover:bg-surface-card",
                  )}
                >
                  <input
                    type="checkbox"
                    name="niches"
                    value={niche.slug}
                    checked={checked}
                    disabled={full}
                    onChange={(e) =>
                      setChosenNiches((current) =>
                        e.target.checked
                          ? [...current, niche.slug]
                          : current.filter((s) => s !== niche.slug),
                      )
                    }
                    className="sr-only"
                  />
                  {niche.name}
                </label>
              );
            })}
          </div>
          <FieldMessages id="niches" error={errors.niches} />
        </fieldset>

        <fieldset aria-describedby={errors.states ? "states-error" : undefined}>
          <legend className="font-semibold text-ink">
            Where creators live
          </legend>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {[
              ["anywhere", "Anywhere in Nigeria"],
              ["states", "Only in some states"],
            ].map(([value, label]) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-ink"
              >
                <input
                  type="radio"
                  name="where"
                  value={value}
                  checked={where === value}
                  onChange={() => setWhere(value)}
                  className="size-5 accent-ink"
                />
                {label}
              </label>
            ))}
          </div>
          {where === "states" && (
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-card bg-white p-4 ring-1 ring-hairline sm:grid-cols-3">
              {NIGERIAN_STATES.map((s) => (
                <label
                  key={s}
                  className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    name="states"
                    value={s}
                    checked={states.includes(s)}
                    onChange={(e) =>
                      setStates((current) =>
                        e.target.checked
                          ? [...current, s]
                          : current.filter((x) => x !== s),
                      )
                    }
                    className="size-4 accent-ink"
                  />
                  {stateLabel(s)}
                </label>
              ))}
            </div>
          )}
          <FieldMessages id="states" error={errors.states} />
        </fieldset>
      </section>

      <section aria-labelledby="dates-title" className="space-y-5">
        <h2 id="dates-title" className="text-display-md">
          Dates
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            label="Applications close"
            name="applicationsCloseOn"
            type="date"
            min={today}
            required
            defaultValue={
              values.applicationsCloseOn ?? campaign?.applicationsCloseOn
            }
            error={errors.applicationsCloseOn}
          />
          <TextField
            label="Post from"
            labelAside={<span className="text-muted">Optional</span>}
            name="postFrom"
            type="date"
            min={today}
            defaultValue={values.postFrom ?? campaign?.postFrom ?? ""}
            error={errors.postFrom}
          />
          <TextField
            label="Posts up by"
            name="deliverBy"
            type="date"
            min={today}
            required
            defaultValue={values.deliverBy ?? campaign?.deliverBy}
            error={errors.deliverBy}
          />
        </div>
      </section>

      <section aria-labelledby="pay-title" className="space-y-5">
        <h2 id="pay-title" className="text-display-md">
          Pay
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Price per creator (₦)"
            name="price"
            inputMode="numeric"
            placeholder="50,000"
            hint={`At least ${formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA)}. Creators can suggest a different price when they apply.`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
          />
          <TextField
            label="How many creators"
            name="places"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PLACES}
            value={places}
            onChange={(e) => setPlaces(e.target.value)}
            error={errors.places}
          />
        </div>
        <SpendSummary price={price} places={places} />
      </section>

      <div className="space-y-4 border-t border-hairline pt-8">
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
        <p className="text-sm text-muted">
          You’ll see how many creators qualify before you publish.
        </p>
      </div>
    </form>
  );
}

function SpendSummary({ price, places }: { price: string; places: string }) {
  const naira = Number(price.replace(/[₦,\s]/g, ""));
  const count = Number(places);
  if (
    !Number.isInteger(naira) ||
    naira < MIN_PRICE_NAIRA ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    return null;
  }
  const spend = maxSpend(naira * KOBO_PER_NAIRA, count);
  return (
    <div role="status" className="rounded-card bg-surface-card p-5 text-ink">
      <p>
        Each creator: {formatNaira(naira * KOBO_PER_NAIRA)} plus our{" "}
        {formatNaira(spend.feePerCreatorKobo)} fee ={" "}
        <strong>{formatNaira(spend.perCreatorKobo)}</strong>.
      </p>
      <p className="mt-1">
        Most you could spend ({count} {count === 1 ? "creator" : "creators"}):{" "}
        <strong>{formatNaira(spend.totalKobo)}</strong>.
      </p>
      <p className="mt-2 text-sm text-muted">
        Nothing is charged now. You pay for each creator when you accept them,
        and the money is held until their work is approved.
      </p>
    </div>
  );
}
