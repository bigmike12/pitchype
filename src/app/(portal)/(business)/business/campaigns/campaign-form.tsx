"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Lock,
  MousePointerClick,
  PencilLine,
  Plus,
  Rocket,
  ShieldCheck,
  Tag,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { ClayTile } from "@/components/brand/stickers";

import { Button } from "@/components/ui/button";
import {
  controlClasses,
  FieldMessages,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormMessage } from "@/components/ui/form-message";
import {
  BRIEF_MAX,
  CHANNEL_LABELS,
  CHANNELS,
  DELIVERABLE_KINDS,
  GUIDELINES_MAX,
  MAX_CAMPAIGN_NICHES,
  MAX_DELIVERABLE_LINES,
  MAX_PLACES,
  MAX_QUANTITY,
  MIN_CPC_NAIRA,
  MIN_PRICE_NAIRA,
  deliverableText,
  formatDay,
  isDeliverableKind,
  kindLabel,
  maxSpend,
  perClickGuidance,
  type CampaignInput,
  type PaymentModel,
} from "@/lib/campaign";
import {
  EVIDENCE_LABELS,
  FINAL_REQUIREMENT_LABELS,
  intervalFromChoice,
  isEvidenceType,
  isFinalRequirement,
} from "@/lib/checkpoints";
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
import { NIGERIAN_STATES, stateLabel, type NigerianState } from "@/lib/profile";
import { cn } from "@/lib/utils";

import { saveCampaignAction, type CampaignFormState } from "./actions";
import { TimelineFields } from "./timeline-fields";

/** The four steps, in order: a short name for the progress bar. */
const STEPS = ["Basics", "Posts and creators", "Pay", "Dates and review"];

// Which step holds each field, so a refused save opens the step to fix.
const FIELD_STEP: Record<string, number> = {
  title: 0,
  brief: 0,
  guidelines: 0,
  deliverables: 1,
  minFollowers: 1,
  niches: 1,
  states: 1,
  cpc: 2,
  destinationUrl: 2,
  blockedChannels: 2,
  price: 2,
  places: 2,
  applicationsCloseOn: 3,
  postFrom: 3,
  deliverBy: 3,
  endsOn: 3,
  checkpointInterval: 3,
  checkpointEvidence: 3,
  finalRequirements: 3,
};

const PAYMENT_OPTIONS = [
  {
    value: "fixed",
    label: "A fixed price per creator",
    description:
      "Each creator is paid an agreed amount for the posts. Best for content you want made.",
    icon: Tag,
    tone: "mint",
  },
  {
    value: "per_click",
    label: "Per click on your link",
    description:
      "Creators share your link and you pay for each real visit, up to a budget. Best for sales and sign-ups.",
    icon: MousePointerClick,
    tone: "lilac",
  },
] as const;

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
  trusted = false,
}: {
  niches: Niche[];
  today: string;
  /** An admin approved one of this business's campaigns, so fixed-price ones skip review. */
  trusted?: boolean;
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
  const [paymentModel, setPaymentModel] = useState<PaymentModel>(
    campaign?.paymentModel ?? "fixed",
  );
  const [cpc, setCpc] = useState(
    campaign?.cpcKobo ? String(campaign.cpcKobo / KOBO_PER_NAIRA) : "",
  );
  const [blocked, setBlocked] = useState<string[]>(
    campaign?.blockedChannels ?? [],
  );
  const perClick = paymentModel === "per_click";
  const reviewed = perClick || !trusted;

  // Steps: the current one shows; the others stay in the form (so a save sends
  // every field), hidden.
  const formRef = useRef<HTMLFormElement>(null);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(campaign ? STEPS.length - 1 : 0);
  // The typed title and brief, read when the review step opens.
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);

  /** Reads the uncontrolled fields the review shows from the form itself. */
  function refreshSnapshot() {
    if (formRef.current) {
      setSnapshot(readSnapshot(new FormData(formRef.current)));
    }
  }

  function goTo(index: number) {
    if (index === STEPS.length - 1) refreshSnapshot();
    setStep(index);
    setFurthest((f) => Math.max(f, index));
    // After React shows the step: move focus to its title, so keyboard and
    // screen-reader users land at the top of what changed.
    requestAnimationFrame(() =>
      stepRefs.current[index]?.querySelector("h2")?.focus(),
    );
  }

  /** Checks the current step's fields in the browser, then moves on. */
  function next() {
    const fields = stepRefs.current[step]?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    for (const field of fields ?? []) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return;
      }
    }
    goTo(step + 1);
  }

  // After a refused save has opened its step, put focus on the first field to
  // fix (the save button the user pressed is now hidden).
  useEffect(() => {
    if (state.status !== "error") return;
    requestAnimationFrame(() => {
      const open = stepRefs.current.find((el) => el && !el.hidden);
      open?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, [state]);

  // A refused save: open the first step with something to fix. Done while
  // rendering, when a new result arrives (React's "adjust state on a prop
  // change" pattern), not in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const steps = Object.keys(state.errors ?? {})
      .map((field) => FIELD_STEP[field])
      .filter((index) => index !== undefined);
    if (state.status === "error" && steps.length > 0) {
      setStep(Math.min(...steps));
    }
  }

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
      ref={formRef}
      action={formAction}
      // Submit by hand: React resets a form after its action, and the inputs
      // this form controls (deliverable lines, states, niches) would show
      // their first values again while React still holds the new ones. The
      // next save would then send the stale ones.
      onSubmit={(event) => {
        event.preventDefault();
        // Enter in a field submits the form: before the last step it means
        // Continue, so nothing is saved without the last look.
        if (step < STEPS.length - 1) {
          next();
          return;
        }
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      noValidate
      // Keep the last look current while the dates are typed on that step.
      onChange={() => {
        if (step === STEPS.length - 1) refreshSnapshot();
      }}
    >
      {campaign && (
        <input type="hidden" name="campaignId" value={campaign.id} />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <StepProgress step={step} furthest={furthest} onGo={goTo} />
          {/* Outside the steps, so a refused save's message shows on
              whichever step opens to fix it. */}
          <FormMessage status={state.status} message={state.message} />

          <BuilderStep
            index={0}
            step={step}
            stepRef={(el) => {
              stepRefs.current[0] = el;
            }}
            icon={PencilLine}
            tone="lilac"
            title="Start with the basics"
            lead="The title and brief are the first things creators read."
          >
            <div className="space-y-5">
              <div className="space-y-5">
                <TextField
                  label="Title"
                  name="title"
                  required
                  minLength={5}
                  maxLength={100}
                  hint="What creators see first, e.g. “Launch our new zobo flavour”."
                  defaultValue={values.title ?? campaign?.title}
                  error={errors.title}
                />
                <TextAreaField
                  label="Brief"
                  name="brief"
                  required
                  minLength={20}
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
              </div>
            </div>
          </BuilderStep>

          <BuilderStep
            index={1}
            step={step}
            stepRef={(el) => {
              stepRefs.current[1] = el;
            }}
            icon={Users}
            tone="mint"
            title="What to post, and who can apply"
            lead="Each line is one post you’re paying every creator for."
          >
            <Callout
              tone="attention"
              icon={Lock}
              title="Locked once the campaign is live"
            >
              What creators post and who can apply can’t change after you
              publish, so everyone gets exactly what they agreed to.
            </Callout>
            <h3 className="mt-6 mb-3 font-semibold text-ink">
              What each creator posts
            </h3>
            <div>
              <ul className="space-y-3">
                {rows.map((row, index) => {
                  const kinds = isPlatform(row.platform)
                    ? DELIVERABLE_KINDS[row.platform]
                    : [];
                  const line = index + 1;
                  return (
                    <li
                      key={row.key}
                      className="grid grid-cols-[1fr_1fr] gap-3 rounded-card bg-canvas ring-1 ring-hairline p-3 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-center"
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
                        onChange={(e) =>
                          updateRow(row.key, { kind: e.target.value })
                        }
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
            </div>
            <h3 className="mt-8 mb-3 border-t border-hairline pt-6 font-semibold text-ink">
              Who can apply
            </h3>
            <div className="space-y-6">
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
                Creators need an account on every platform above, with at least
                that many followers.
              </p>

              <label className="flex cursor-pointer items-start gap-3 rounded-card bg-canvas ring-1 ring-hairline p-4">
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
                    Only creators whose accounts we’ve checked. Few are verified
                    yet, so fewer will qualify.
                  </span>
                </span>
              </label>

              <fieldset
                aria-describedby={
                  errors.niches ? "niches-error" : "niches-hint"
                }
              >
                <legend className="font-semibold text-ink">
                  Niches{" "}
                  <span className="font-normal text-muted">(optional)</span>
                </legend>
                <p id="niches-hint" className="mt-1 text-sm text-muted">
                  Up to {MAX_CAMPAIGN_NICHES}. Creators in any of them can
                  apply. Choose none for any niche.
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

              <fieldset
                aria-describedby={errors.states ? "states-error" : undefined}
              >
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
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-card bg-canvas ring-1 ring-hairline p-4 sm:grid-cols-3">
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
            </div>
          </BuilderStep>

          <BuilderStep
            index={2}
            step={step}
            stepRef={(el) => {
              stepRefs.current[2] = el;
            }}
            icon={Wallet}
            tone="sun"
            title="How you pay"
            lead="Nothing is charged now. You pay for each creator when you accept them."
          >
            <ChoiceGroup
              legend="How you pay"
              name="payment_model"
              variant="cards"
              value={paymentModel}
              onValueChange={(value) => setPaymentModel(value as PaymentModel)}
              options={PAYMENT_OPTIONS}
            />
            {perClick && (
              <Callout
                tone="info"
                icon={MousePointerClick}
                title="You pay only for clicks that count"
                className="mt-5"
              >
                Each creator gets their own short link. After the campaign you
                pay for real, unique visits up to their budget, and the rest
                comes back to your wallet. We check every pay-per-click campaign
                before it goes live.
              </Callout>
            )}
            <div className="mt-6">
              <div className="space-y-5">
                {perClick && (
                  <div className="space-y-5">
                    <TextField
                      label="Link you want people to visit"
                      name="destination_url"
                      required
                      type="url"
                      inputMode="url"
                      placeholder="https://www.yourshop.com/sale"
                      hint="Each creator gets their own short link to this page. It can’t change once the campaign is live."
                      defaultValue={
                        values.destinationUrl ?? campaign?.destinationUrl ?? ""
                      }
                      error={errors.destinationUrl}
                    />
                    <TextField
                      label="You pay per click (₦)"
                      name="cpc"
                      required
                      inputMode="numeric"
                      placeholder="50"
                      hint={`At least ₦${MIN_CPC_NAIRA}. Creators can suggest their own rate when they apply; you choose who to hire, at the rate you see. Only real, unique visits count: link previews, bots and repeat visits within 24 hours don’t. Locked once the campaign is live.`}
                      value={cpc}
                      onChange={(e) => setCpc(e.target.value)}
                      error={errors.cpc}
                    />
                    <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-ink">
                      <input
                        type="checkbox"
                        name="utm_tags"
                        defaultChecked={campaign?.utmTags ?? true}
                        className="mt-0.5 size-5 accent-ink"
                      />
                      <span>
                        Add tracking tags to my link
                        <span className="block text-sm text-muted">
                          Adds utm_source=pitchype, so your own analytics see
                          these visits and any sales they bring. Untick it if
                          your site breaks on extra link parameters.
                        </span>
                      </span>
                    </label>
                    <fieldset>
                      <legend className="text-sm font-medium text-ink">
                        Don’t share my link on
                      </legend>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                        {CHANNELS.map((c) => (
                          <label
                            key={c}
                            className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-ink"
                          >
                            <input
                              type="checkbox"
                              name="blocked_channels"
                              value={c}
                              checked={blocked.includes(c)}
                              onChange={(e) =>
                                setBlocked((current) =>
                                  e.target.checked
                                    ? [...current, c]
                                    : current.filter((x) => x !== c),
                                )
                              }
                              className="size-4 accent-ink"
                            />
                            {CHANNEL_LABELS[c]}
                          </label>
                        ))}
                      </div>
                      <p className="mt-2 text-sm text-muted">
                        Paid ads and click-for-reward groups are never allowed.
                        Clicks we can trace to a blocked channel aren’t paid
                        for.
                      </p>
                      <FieldMessages
                        id="blocked_channels"
                        error={errors.blockedChannels}
                      />
                    </fieldset>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField
                    label={
                      perClick
                        ? "Budget per creator (₦)"
                        : "Price per creator (₦)"
                    }
                    name="price"
                    required
                    inputMode="numeric"
                    placeholder={perClick ? "25,000" : "50,000"}
                    hint={
                      perClick
                        ? `At least ${formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA)}. The most one creator can earn; what isn’t earned comes back to you. Locked once the campaign is live.`
                        : `At least ${formatNaira(MIN_PRICE_NAIRA * KOBO_PER_NAIRA)}. Creators can suggest a different price when they apply. Locked once the campaign is live.`
                    }
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    error={errors.price}
                  />
                  <TextField
                    label="How many creators"
                    name="places"
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PLACES}
                    value={places}
                    onChange={(e) => setPlaces(e.target.value)}
                    error={errors.places}
                  />
                </div>
                <SpendSummary
                  price={price}
                  places={places}
                  cpc={perClick ? cpc : null}
                />
              </div>
            </div>
          </BuilderStep>

          <BuilderStep
            index={3}
            step={step}
            stepRef={(el) => {
              stepRefs.current[3] = el;
            }}
            icon={CalendarCheck}
            tone="peach"
            title="Dates, and a last look"
            lead="When applications close, when the campaign runs, and what creators send along the way."
          >
            <div className="space-y-8">
              <div className="max-w-xs">
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
              </div>
              <TimelineFields
                today={today}
                perClick={perClick}
                initial={{
                  postFrom: values.postFrom ?? campaign?.postFrom ?? "",
                  deliverBy: values.deliverBy ?? campaign?.deliverBy ?? "",
                  endsOn: values.endsOn ?? campaign?.endsOn ?? "",
                  checkpointsEnabled: campaign?.checkpointsEnabled ?? false,
                  checkpointIntervalDays:
                    campaign?.checkpointIntervalDays ?? null,
                  checkpointEvidence: campaign?.checkpointEvidence ?? [],
                  finalRequirements: campaign?.finalRequirements ?? [],
                }}
                errors={errors}
              />
            </div>
            <Review
              snapshot={snapshot}
              rows={rows}
              paymentModel={paymentModel}
              price={price}
              cpc={cpc}
              places={places}
              nicheNames={niches
                .filter((n) => chosenNiches.includes(n.slug))
                .map((n) => n.name)}
              states={where === "states" ? states : []}
            />
            <Callout
              tone={reviewed ? "attention" : "success"}
              icon={reviewed ? ShieldCheck : Rocket}
              title={
                reviewed
                  ? "We check this campaign before it goes live"
                  : "It goes live when you publish"
              }
              className="mt-6"
            >
              {reviewed
                ? perClick
                  ? "Every pay-per-click campaign is checked, to confirm the link is yours. Usually within a working day."
                  : "We check a business’s first campaign, usually within a working day."
                : "Save the draft, check who qualifies, then publish."}{" "}
              Saving keeps it as a draft; nothing is published yet.
            </Callout>
            <div className="mt-6 space-y-4">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </BuilderStep>

          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => goTo(step - 1)}
              >
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 && (
              <Button type="button" onClick={next}>
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        <aside
          aria-label="Your campaign so far"
          className="lg:sticky lg:top-20"
        >
          <CampaignSoFar
            paymentModel={paymentModel}
            price={price}
            cpc={cpc}
            places={places}
            reviewed={reviewed}
          />
        </aside>
      </div>
    </form>
  );
}

function SpendSummary({
  price,
  places,
  cpc,
}: {
  price: string;
  places: string;
  /** The price per click as typed, for a per-click campaign. */
  cpc: string | null;
}) {
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
  const cpcNaira = cpc === null ? null : Number(cpc.replace(/[₦,\s]/g, ""));
  if (
    cpcNaira !== null &&
    (!Number.isInteger(cpcNaira) || cpcNaira < MIN_CPC_NAIRA)
  ) {
    return null;
  }
  const spend = maxSpend(naira * KOBO_PER_NAIRA, count);
  const guidance =
    cpcNaira === null
      ? null
      : perClickGuidance(naira * KOBO_PER_NAIRA, cpcNaira * KOBO_PER_NAIRA);
  return (
    <>
      <div role="status" className="rounded-card bg-surface-card p-5 text-ink">
        {guidance && cpcNaira !== null && (
          <>
            <p className="mb-1">
              Up to{" "}
              <strong>{guidance.clicks.toLocaleString("en-NG")} clicks</strong>{" "}
              per creator at {formatNaira(cpcNaira * KOBO_PER_NAIRA)} each.
            </p>
            <p className="mb-1">
              A creator who sends them all keeps{" "}
              <strong>{formatNaira(guidance.takeHomeKobo)}</strong> after our{" "}
              {formatNaira(guidance.creatorFeeKobo)} fee.
            </p>
          </>
        )}
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
          {cpcNaira !== null
            ? "Nothing is charged now. You pay each creator’s budget when you accept them; it’s held, and after the campaign you pay only for the clicks they sent. The rest comes back to your wallet."
            : "Nothing is charged now. You pay for each creator when you accept them, and the money is held until their work is approved."}
        </p>
      </div>
      {guidance?.atMinimum && (
        <Callout
          tone="attention"
          icon={TriangleAlert}
          title="This is the lowest rate we allow"
        >
          Creators see your rate before they apply, so a campaign at the minimum
          may get fewer applications. Creators can also suggest their own rate,
          and you choose whether to hire at it. A higher rate doesn’t raise the
          most you can spend, which stays at the budget; it only pays more for
          each click.
        </Callout>
      )}
      {guidance && (
        <p className="text-sm text-muted">
          We don’t show a typical rate for your niche yet. We’ll add one here
          once enough Pitchype campaigns have run to back it up.
        </p>
      )}
    </>
  );
}

/** Where the campaign is in the four steps; finished steps can be revisited. */
function StepProgress({
  step,
  furthest,
  onGo,
}: {
  step: number;
  furthest: number;
  onGo: (index: number) => void;
}) {
  return (
    <nav aria-label="Campaign steps">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((name, index) => (
          <li key={name}>
            <button
              type="button"
              disabled={index > furthest}
              onClick={() => onGo(index)}
              aria-current={index === step ? "step" : undefined}
              className="group w-full rounded-control py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-default"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 rounded-full",
                  index <= step ? "bg-brand-violet" : "bg-surface-soft",
                )}
              />
              <span
                className={cn(
                  "mt-2 hidden items-center gap-1.5 text-sm sm:flex",
                  index === step ? "font-semibold text-ink" : "text-muted",
                  index <= furthest && index !== step && "group-hover:text-ink",
                )}
              >
                {index < furthest && index !== step && (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                {name}
              </span>
              <span className="sr-only sm:hidden">{name}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted sm:hidden">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>
    </nav>
  );
}

/** One step: a framed card with an icon, a title, why we ask, and its fields. */
function BuilderStep({
  index,
  step,
  stepRef,
  icon,
  tone,
  title,
  lead,
  children,
}: {
  index: number;
  step: number;
  stepRef: (el: HTMLElement | null) => void;
  icon: LucideIcon;
  tone: "lilac" | "mint" | "sun" | "peach";
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={stepRef}
      hidden={step !== index}
      aria-labelledby={`step-${index}-title`}
      className="rounded-panel panel p-5 sm:p-8"
    >
      <div className="mb-6 flex items-start gap-4">
        <ClayTile icon={icon} tone={tone} size="lg" className="shrink-0" />
        <div>
          <h2
            id={`step-${index}-title`}
            tabIndex={-1}
            className="text-display-md outline-none"
          >
            {title}
          </h2>
          <p className="mt-1 text-muted">{lead}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** What the last look reads from the form's uncontrolled fields. */
type Snapshot = {
  title: string;
  brief: string;
  /** "Instagram: 10K–50K followers or more" for each platform with a minimum. */
  followers: string[];
  verifiedOnly: boolean;
  destinationUrl: string;
  applicationsCloseOn: string;
  postFrom: string;
  deliverBy: string;
  endsOn: string;
  /** "Every 7 days: a written progress update, links", or empty when off. */
  checkpoints: string;
  finalRequirements: string[];
};

const EMPTY_SNAPSHOT: Snapshot = {
  title: "",
  brief: "",
  followers: [],
  verifiedOnly: false,
  destinationUrl: "",
  applicationsCloseOn: "",
  postFrom: "",
  deliverBy: "",
  endsOn: "",
  checkpoints: "",
  finalRequirements: [],
};

function readSnapshot(data: FormData): Snapshot {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const followers = PLATFORMS.flatMap((platform) => {
    const min = text(`minFollowers.${platform}`);
    return min && min in MIN_FOLLOWER_LABELS
      ? [
          `${PLATFORM_RULES[platform].label}: ${MIN_FOLLOWER_LABELS[min as FollowerRange]}`,
        ]
      : [];
  });
  return {
    title: text("title"),
    brief: text("brief"),
    followers,
    verifiedOnly: data.get("verifiedOnly") === "on",
    destinationUrl: text("destination_url"),
    applicationsCloseOn: text("applicationsCloseOn"),
    postFrom: text("postFrom"),
    deliverBy: text("deliverBy"),
    endsOn: text("endsOn"),
    checkpoints: checkpointSummary(data),
    finalRequirements: data
      .getAll("finalRequirements")
      .filter(isFinalRequirement)
      .map((r) => FINAL_REQUIREMENT_LABELS[r]),
  };
}

/** "Every 7 days: a written progress update, links", or "" when checkpoints are off. */
function checkpointSummary(data: FormData): string {
  if (data.get("checkpointsEnabled") !== "on") return "";
  const frequency = String(data.get("checkpointFrequency") ?? "");
  const days = intervalFromChoice(
    frequency,
    String(data.get("checkpointCustomDays") ?? ""),
  );
  const needs = data
    .getAll("checkpointEvidence")
    .filter(isEvidenceType)
    .map((type) => EVIDENCE_LABELS[type].toLowerCase());
  return `${days === null ? "Frequency not set" : `Every ${days} days`}: ${needs.join(", ") || "nothing chosen yet"}`;
}

/** Whole naira typed with or without commas or ₦, formatted; null if not a whole number. */
function typedNaira(raw: string): string | null {
  const naira = Number(raw.replace(/[₦,\s]/g, ""));
  return raw.trim() !== "" && Number.isInteger(naira) && naira > 0
    ? formatNaira(naira * KOBO_PER_NAIRA)
    : null;
}

/** The last step's look back over everything that locks once the campaign is live. */
function Review({
  snapshot,
  rows,
  paymentModel,
  price,
  cpc,
  places,
  nicheNames,
  states,
}: {
  snapshot: Snapshot;
  rows: Row[];
  paymentModel: PaymentModel;
  price: string;
  cpc: string;
  places: string;
  nicheNames: string[];
  states: string[];
}) {
  const posts = rows.flatMap((r) =>
    isPlatform(r.platform) && isDeliverableKind(r.platform, r.kind)
      ? [
          deliverableText({
            platform: r.platform,
            kind: r.kind,
            quantity: Number(r.quantity) || 1,
          }),
        ]
      : [],
  );
  const budget = typedNaira(price) ?? "Not set";
  const pay =
    paymentModel === "per_click"
      ? `${typedNaira(cpc) ?? "Not set"} per click, up to ${budget} per creator`
      : `${budget} per creator`;
  const who = [
    nicheNames.length > 0 ? nicheNames.join(", ") : "Any niche",
    states.length > 0
      ? states.map((st) => stateLabel(st as NigerianState)).join(", ")
      : "anywhere in Nigeria",
    ...snapshot.followers,
    ...(snapshot.verifiedOnly ? ["verified creators only"] : []),
  ].join("; ");
  const day = (value: string) => (value ? formatDay(value) : "Not set");
  const lines: [string, string][] = [
    ["Title", snapshot.title || "Not set"],
    ["Brief", snapshot.brief ? truncate(snapshot.brief, 160) : "Not set"],
    ["Each creator posts", posts.join(", ") || "Nothing yet"],
    ["Who can apply", who],
    ["Pay", pay],
    ...(paymentModel === "per_click"
      ? ([["Link", snapshot.destinationUrl || "Not set"]] as [string, string][])
      : []),
    ["Creators wanted", places || "Not set"],
    ["Applications close", day(snapshot.applicationsCloseOn)],
    ["Campaign starts", day(snapshot.postFrom)],
    ["Final delivery by", day(snapshot.deliverBy)],
    ["Campaign ends", day(snapshot.endsOn)],
    ["Checkpoints", snapshot.checkpoints || "None"],
    ...(paymentModel === "per_click"
      ? []
      : ([
          [
            "Final submission",
            snapshot.finalRequirements.join(", ") || "A link or a screenshot",
          ],
        ] as [string, string][])),
  ];
  return (
    <div className="mt-8 border-t border-hairline pt-6">
      <h3 className="font-semibold text-ink">Your campaign, as it will lock</h3>
      <p className="mt-1 text-sm text-muted">
        Pay, what to post and who can apply can’t change once it’s live.
      </p>
      <dl className="mt-3 divide-y divide-hairline rounded-card bg-canvas ring-1 ring-hairline">
        {lines.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The running figures beside every step: what it could cost, and what happens next. */
function CampaignSoFar({
  paymentModel,
  price,
  cpc,
  places,
  reviewed,
}: {
  paymentModel: PaymentModel;
  price: string;
  cpc: string;
  places: string;
  reviewed: boolean;
}) {
  const naira = Number(price.replace(/[₦,\s]/g, ""));
  const count = Number(places);
  const cpcNaira = Number(cpc.replace(/[₦,\s]/g, ""));
  const priced =
    Number.isInteger(naira) &&
    naira >= MIN_PRICE_NAIRA &&
    Number.isInteger(count) &&
    count >= 1;
  const spend = priced ? maxSpend(naira * KOBO_PER_NAIRA, count) : null;
  const perClick = paymentModel === "per_click";
  return (
    <div className="rounded-panel panel p-5">
      <p className="font-semibold text-ink">Your campaign so far</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Pay</dt>
          <dd className="text-right text-ink">
            {perClick ? "Per click" : "Fixed price"}
          </dd>
        </div>
        {perClick &&
          Number.isInteger(cpcNaira) &&
          cpcNaira >= MIN_CPC_NAIRA && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Per click</dt>
              <dd className="text-ink tabular-nums">
                {formatNaira(cpcNaira * KOBO_PER_NAIRA)}
              </dd>
            </div>
          )}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">
            {perClick ? "Budget per creator" : "Per creator"}
          </dt>
          <dd className="text-ink tabular-nums">
            {spend ? formatNaira(naira * KOBO_PER_NAIRA) : "Not set"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Creators</dt>
          <dd className="text-ink tabular-nums">
            {Number.isInteger(count) && count >= 1 ? count : "Not set"}
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-hairline pt-4">
        <p className="text-sm text-muted">Most you could spend</p>
        <p
          className="mt-1 font-display text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums"
          aria-live="polite"
        >
          {spend ? formatNaira(spend.totalKobo) : "–"}
        </p>
        <p className="mt-2 text-xs text-muted">
          Includes our fee (5%, at least ₦500 per creator). Nothing is charged
          until you accept a creator.
        </p>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-card bg-surface-soft p-3 text-sm text-ink">
        {reviewed ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Rocket className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}
        {reviewed
          ? "Checked by Pitchype before it goes live."
          : "Goes live as soon as you publish."}
      </p>
    </div>
  );
}
