"use client";

import { AtSign, BadgeCheck, Users } from "lucide-react";
import { useActionState } from "react";

import { PlatformIcon } from "@/components/creators/platform-icon";
import { VerifiedMark } from "@/components/creators/platform-list";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import {
  FOLLOWER_RANGE_LABELS,
  FOLLOWER_RANGES,
  PLATFORM_RULES,
  formatDate,
  formatDateTime,
  type Platform,
  type VerificationView,
} from "@/lib/creator-profile";
import type { OwnPlatform } from "@/lib/db/creators";
import { CONTACT_EMAIL } from "@/lib/site";

import {
  removePlatformAction,
  requestVerificationAction,
  savePlatformAction,
  submitVerificationAction,
  type PlatformState,
} from "./actions";

const RANGE_OPTIONS = FOLLOWER_RANGES.map((range) => ({
  value: range,
  label: FOLLOWER_RANGE_LABELS[range],
}));

/**
 * One platform on the profile editor: add it, edit it, remove it, verify it.
 * Onboarding hides the verification part (`showVerification={false}`).
 */
export function PlatformCard({
  platform,
  saved,
  verification,
  showVerification = true,
}: {
  platform: Platform;
  saved: OwnPlatform | null;
  verification: VerificationView | null;
  showVerification?: boolean;
}) {
  const label = PLATFORM_RULES[platform].label;

  return (
    <li className="rounded-card panel p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-card text-ink">
          <PlatformIcon platform={platform} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{label}</h3>
          {saved ? (
            <SavedSummary saved={saved} verification={verification} />
          ) : (
            <p className="text-sm text-muted">Not added</p>
          )}
        </div>
      </div>

      {showVerification && saved && verification && (
        <Verification
          platform={platform}
          handle={saved.handle}
          verification={verification}
        />
      )}

      <details className="mt-4">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-control border border-field bg-canvas px-4 text-[0.9375rem] font-semibold text-ink hover:bg-surface-card [&::-webkit-details-marker]:hidden">
          {saved ? `Edit ${label}` : `Add ${label}`}
        </summary>
        <PlatformForm
          platform={platform}
          saved={saved}
          verified={Boolean(verification?.verified)}
        />
      </details>
    </li>
  );
}

function SavedSummary({
  saved,
  verification,
}: {
  saved: OwnPlatform;
  verification: VerificationView | null;
}) {
  const verified = verification?.verified;
  return (
    <>
      <p className="break-all text-ink">@{saved.handle}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        {verified ? (
          <>
            <span className="font-medium text-ink">
              {verified.followerCount.toLocaleString("en-NG")} followers
            </span>
            <VerifiedMark />
            <span className="text-muted">
              as of {formatDate(verified.verifiedAt)}
            </span>
          </>
        ) : (
          <>
            <span className="font-medium text-ink">
              {FOLLOWER_RANGE_LABELS[saved.followerRange]} followers
            </span>
            <span className="text-muted">
              Self-reported, updated {formatDate(saved.followersUpdatedAt)}
            </span>
          </>
        )}
      </p>
    </>
  );
}

function Verification({
  platform,
  handle,
  verification,
}: {
  platform: Platform;
  handle: string;
  verification: VerificationView;
}) {
  const label = PLATFORM_RULES[platform].label;
  const { step, verified } = verification;

  if (step.kind === "awaiting_code") {
    return (
      <div className="mt-4 rounded-card bg-surface-soft p-4">
        <p className="font-semibold text-ink">Your code</p>
        <p className="mt-1 text-2xl font-semibold tracking-wide break-all text-ink select-all">
          {step.code}
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-body">
          <li>
            Add the code anywhere in the bio of{" "}
            <a
              href={PLATFORM_RULES[platform].profileUrl(handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              @{handle}
              <span className="sr-only"> (opens {label})</span>
            </a>
            .
          </li>
          <li>
            Press “I’ve added it”. We check by hand, usually within two working
            days.
          </li>
          <li>Once you see the Verified badge, you can take the code out.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          Expires {formatDateTime(step.expiresAt)} if you don’t press the button
          first.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={submitVerificationAction}>
            <input type="hidden" name="requestId" value={step.requestId} />
            <Button type="submit">I’ve added it</Button>
          </form>
          <NewCodeButton platform={platform} label="Get a new code" />
        </div>
      </div>
    );
  }

  if (step.kind === "in_review") {
    return (
      <p className="mt-4 rounded-card bg-surface-soft p-4 text-sm text-ink">
        We’re checking your bio. Keep the code there until you see the Verified
        badge.
      </p>
    );
  }

  const message =
    step.kind === "rejected"
      ? "We couldn’t find your code in the bio. Check it’s there exactly as shown, then try again with a new code."
      : step.kind === "revoked"
        ? `Another account proved it owns @${handle}, so your badge was removed. If that’s wrong, email ${CONTACT_EMAIL}.`
        : verified
          ? "Re-verify every few months so businesses see a recent count."
          : "Prove this account is yours: we’ll give you a code to put in your bio. Verified profiles show the follower count we saw.";

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-card bg-surface-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex gap-2 text-sm text-ink">
        <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
      <NewCodeButton
        platform={platform}
        label={verified ? "Re-verify" : "Get verified"}
      />
    </div>
  );
}

function NewCodeButton({
  platform,
  label,
}: {
  platform: Platform;
  label: string;
}) {
  return (
    <form action={requestVerificationAction}>
      <input type="hidden" name="platform" value={platform} />
      <Button type="submit" variant="secondary">
        {label}
      </Button>
    </form>
  );
}

function PlatformForm({
  platform,
  saved,
  verified,
}: {
  platform: Platform;
  saved: OwnPlatform | null;
  verified: boolean;
}) {
  const rules = PLATFORM_RULES[platform];
  const [state, formAction, pending] = useActionState<PlatformState, FormData>(
    savePlatformAction,
    {
      status: "idle",
      values: saved
        ? { handle: saved.handle, followerRange: saved.followerRange }
        : undefined,
    },
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const id = (field: string) => `${platform}-${field}`;

  return (
    <div className="mt-4 space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="platform" value={platform} />
        <TextField
          id={id("handle")}
          label={`${rules.label} username`}
          name="handle"
          icon={AtSign}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          hint={
            verified
              ? "Changing your username removes your Verified badge."
              : "Or paste your profile link."
          }
          defaultValue={values.handle}
          error={errors.handle}
        />
        <SelectField
          id={id("range")}
          label="Followers"
          name="followerRange"
          icon={Users}
          required
          placeholder="Choose a range"
          options={RANGE_OPTIONS}
          hint={
            verified
              ? "While you’re verified, businesses see the count we checked instead."
              : "Be honest: businesses can ask you to verify."
          }
          defaultValue={values.followerRange ?? ""}
          error={errors.followerRange}
        />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : saved ? "Save changes" : `Add ${rules.label}`}
        </Button>
      </form>
      {saved && (
        <form action={removePlatformAction}>
          <input type="hidden" name="platform" value={platform} />
          <Button type="submit" variant="ghost" className="-ml-3 text-danger">
            Remove {rules.label}
          </Button>
        </form>
      )}
    </div>
  );
}
