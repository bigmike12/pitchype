import { BadgeCheck, Clock, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Callout } from "@/components/ui/callout";
import { buttonVariants } from "@/components/ui/button";
import {
  getIdentityAttemptState,
  getMyIdentityChecks,
  type IdentityCheckKind,
  type MyIdentityCheck,
} from "@/lib/db/identity";
import { isDojahConfigured } from "@/lib/dojah";
import { formatDateTime } from "@/lib/creator-profile";
import { identityFailureLine } from "@/lib/notifications";

import { BusinessIdentity } from "./business-identity";
import { identityPanelState, type PanelState } from "./panel-state";
import { PersonCheckForm } from "./person-check-form";
import { RefreshWhileWaiting } from "./refresh-while-waiting";

export type IdentityPanelData = {
  role: "influencer" | "business";
  state: PanelState;
  checks: MyIdentityCheck[];
  /** When the daily cap lifts; null when only an admin can reopen it. */
  nextAllowedAt: string | null;
  configured: boolean;
};

const BUSINESS_KINDS: IdentityCheckKind[] = ["owner_nin", "business_cac"];

/** Reads what the identity section needs for the signed-in person. */
export async function loadIdentityPanel(
  userId: string,
  role: "influencer" | "business",
): Promise<IdentityPanelData> {
  const checks = await getMyIdentityChecks();
  const kinds: IdentityCheckKind[] =
    role === "influencer" ? ["creator_nin"] : BUSINESS_KINDS;
  const attempts = await Promise.all(
    kinds.map((kind) => getIdentityAttemptState(userId, kind)),
  );
  // Business: capped only when every route is capped; otherwise the form shows.
  const capped = attempts.every((a) => a.capped);
  const lifts = attempts
    .map((a) => a.nextAllowedAt)
    .filter((t): t is string => t !== null)
    .sort();
  return {
    role,
    state: identityPanelState(role, checks, capped),
    checks,
    nextAllowedAt: attempts.every((a) => a.nextAllowedAt !== null)
      ? (lifts[0] ?? null)
      : null,
    configured: isDojahConfigured(),
  };
}

const PRIVACY: Record<"influencer" | "business", string> = {
  influencer:
    "Your NIN and a live selfie are checked by our identity partner, Dojah. We keep only the result and the last 3 digits of your NIN. We never keep your selfie.",
  business:
    "A registered business is checked with CAC through our identity partner, Dojah, and we keep the company’s registered details. For an unregistered business, the owner’s NIN and a live selfie are checked by Dojah, and we keep only the result and the last 3 digits of the NIN. We never keep a selfie.",
};

/**
 * The identity section: what has been checked, or the form to do it. Used on
 * the account page and in onboarding (where `next` is "onboarding" and the
 * step's own buttons sit under it).
 */
export function IdentityPanel({
  data,
  next,
}: {
  data: IdentityPanelData;
  next: "onboarding" | "account";
}) {
  const { state, role, checks } = data;
  const verified = checks.find(
    (c) =>
      c.status === "verified" &&
      (role === "influencer"
        ? c.kind === "creator_nin"
        : c.kind !== "director_nin" && c.kind !== "creator_nin"),
  );
  const failed = checks.find(
    (c) => c.status === "failed" && c.kind !== "director_nin",
  );

  if (state === "verified" && verified) {
    return (
      <div className="space-y-4">
        <Callout
          tone="success"
          icon={BadgeCheck}
          title="Your identity is confirmed"
        >
          {verified.companyNameOnRecord
            ? `${verified.companyNameOnRecord}, registration number ${verified.registrationNumber}.`
            : verified.legalNameOnRecord
              ? `${verified.legalNameOnRecord}${verified.idLast3 ? `, ID ending ${verified.idLast3}` : ""}.`
              : null}
          {verified.decidedAt ? (
            <span className="mt-1 block text-sm">
              Checked {formatDateTime(verified.decidedAt)}. Only you can see
              this.
            </span>
          ) : null}
        </Callout>
      </div>
    );
  }

  if (state === "in_progress") {
    return (
      <>
        <RefreshWhileWaiting />
        <Callout tone="info" icon={Clock} title="Checking…">
          This usually takes under a minute. You can leave this page; we’ll tell
          you when it’s done.
        </Callout>
      </>
    );
  }

  if (state === "review") {
    return (
      <Callout tone="info" icon={Clock} title="We’re taking a closer look">
        This usually takes 1–2 working days. We’ll tell you when it’s done.
      </Callout>
    );
  }

  if (state === "capped") {
    return (
      <Callout
        tone="attention"
        icon={ShieldAlert}
        title="You’ve used your tries for now"
      >
        {data.nextAllowedAt
          ? `You can try again after ${formatDateTime(data.nextAllowedAt)}. `
          : ""}
        Contact us if you’d like help getting through it.
      </Callout>
    );
  }

  return (
    <div className="space-y-6">
      {state === "failed" && failed ? (
        <Callout
          tone="attention"
          icon={TriangleAlert}
          title="We couldn’t confirm your identity"
        >
          {identityFailureLine(failed.kind, failed.failureReason)}
        </Callout>
      ) : null}

      {!data.configured ? (
        <Callout tone="info" icon={Clock} title="Not available right now">
          Identity checks aren’t switched on yet. Try again a little later.
        </Callout>
      ) : role === "influencer" ? (
        <PersonCheckForm kind="creator_nin" />
      ) : (
        <BusinessIdentity next={next} />
      )}
      <p className="max-w-xl text-sm text-muted">{PRIVACY[role]}</p>
    </div>
  );
}

/** Onboarding's buttons under the panel: Continue once confirmed, otherwise "Do this later". */
export function OnboardingIdentityActions({ state }: { state: PanelState }) {
  const done =
    state === "verified" || state === "review" || state === "in_progress";
  return (
    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
      <Link
        href="/onboarding/done"
        className={buttonVariants({
          variant: done ? "default" : "secondary",
          size: "lg",
          className: "w-full sm:w-auto",
        })}
      >
        {done ? "Continue" : "Do this later"}
      </Link>
      <Link href="/home" className="link text-center sm:ml-2">
        Finish later
      </Link>
    </div>
  );
}
