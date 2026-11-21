// The words and links for notifications. The database stores what happened
// (a kind and the facts, see the create_notifications migration); this file
// turns that into what a person reads, so copy changes need no migration.

import { formatDay } from "./campaign.ts";
import {
  formatDateTime,
  PLATFORM_RULES,
  type Platform,
} from "./creator-profile.ts";
import { transferFee } from "./fees.ts";
import { formatNaira } from "./money.ts";

export type NotificationRow = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  occurredAt: string;
  readAt: string | null;
};

export type NotificationView = {
  title: string;
  /** A second line: a note, a message preview or what to do next. */
  body: string | null;
  href: string;
};

type Role = "business" | "influencer";

/** What to fix after a failed identity check, in plain words. Duplicate IDs stay neutral. */
export function identityFailureLine(
  kind: string | null,
  reason: string | null,
) {
  const idName = kind === "creator_nin" ? "NIN" : "BVN";
  const lines: Record<string, string> = {
    name_mismatch:
      kind === "business_cac"
        ? "The name doesn’t match CAC’s records. Check the spelling and try again."
        : `The name doesn’t match your ${idName} record. Check the spelling against your ${idName} slip or bank record and try again.`,
    selfie_mismatch:
      "Your selfie didn’t match. Try again in good light, facing the camera.",
    liveness_failed:
      "Your selfie didn’t match. Try again in good light, facing the camera.",
    id_not_found: `We couldn’t find that ${idName}. Check the number and try again.`,
    company_not_found:
      "We couldn’t find that registration number at CAC. Check it and try again.",
    company_inactive:
      "CAC lists this company as not active. Contact us if that looks wrong.",
    not_a_director:
      "That person isn’t listed as a director of your company at CAC. A listed director needs to do this check.",
    duplicate_identity:
      "We weren’t able to confirm it. Contact us if you think this is a mistake.",
  };
  return (
    (reason !== null && Object.hasOwn(lines, reason) ? lines[reason] : null) ??
    "Something went wrong with the check. Please try again."
  );
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/**
 * What a notification says and where it leads, or null for a kind this
 * version of the app doesn't know (a newer one, say), which is then left out
 * rather than shown blank. `role` only matters for kinds both sides receive.
 */
export function describeNotification(
  n: NotificationRow,
  role: Role = "business",
): NotificationView | null {
  const d = n.data;
  const name = text(d.name) ?? "Someone";
  const title = text(d.campaign_title);
  const quoted = title ? `“${title}”` : "your campaign";
  const theirs = title ? `“${title}”` : "a campaign";
  const campaignId = text(d.campaign_id);
  const note = text(d.note);
  const engagementId = text(d.engagement_id);

  // Where each side sees a hire; the business and creator pages differ.
  const businessHire = engagementId
    ? `/business/engagements/${engagementId}`
    : "/business/campaigns";
  // There is no list of jobs yet; a creator's applications list their hires.
  const creatorJob = engagementId ? `/jobs/${engagementId}` : "/applications";
  // Each side's page for a dispute about a hire.
  const disputePage = engagementId
    ? role === "business"
      ? `/business/engagements/${engagementId}/dispute`
      : `/jobs/${engagementId}/dispute`
    : role === "business"
      ? "/business/campaigns"
      : "/applications";

  const applicants = campaignId
    ? `/business/campaigns/${campaignId}/applications`
    : "/business/campaigns";
  const businessCampaign = campaignId
    ? `/business/campaigns/${campaignId}`
    : "/business/campaigns";
  const creatorCampaign = campaignId
    ? `/campaigns/${campaignId}`
    : "/applications";

  switch (n.kind) {
    case "application_received":
      return {
        title: `${name} applied to ${quoted}`,
        body: null,
        href: applicants,
      };
    case "application_updated":
      return {
        title: `${name} changed their application to ${quoted}`,
        body: "Their price or note changed.",
        href: applicants,
      };
    case "application_withdrawn":
      return {
        title: `${name} withdrew from ${quoted}`,
        body: null,
        href: `${applicants}${campaignId ? "?tab=closed" : ""}`,
      };
    case "application_shortlisted":
      return {
        title: `${name} shortlisted you for ${theirs}`,
        body: null,
        href: creatorCampaign,
      };
    case "application_hired":
      return {
        title: `${name} hired you for ${theirs}`,
        body: "Work starts once they pay. Don’t start before then.",
        href: creatorCampaign,
      };
    case "application_passed":
      return {
        title: `${name} passed on your application to ${theirs}`,
        body: note,
        href: creatorCampaign,
      };
    case "hire_cancelled":
      return {
        title: `${name} cancelled your hire for ${theirs}`,
        body: "It was cancelled before payment, so no work was due.",
        href: creatorCampaign,
      };
    case "hire_lapsed": {
      return role === "business"
        ? {
            title: `Your hire of ${name} for ${quoted} lapsed`,
            body: "It wasn’t paid within 48 hours, so the place is open again.",
            href: engagementId
              ? `/business/engagements/${engagementId}/pay`
              : applicants,
          }
        : {
            title: `${name}’s hire for ${theirs} lapsed`,
            body: "They didn’t pay within 48 hours, so no work is due.",
            href: creatorCampaign,
          };
    }
    case "hire_funded":
      return {
        title: `${name} paid for ${theirs}`,
        body: "The payment is held safely. You can start work now.",
        href: creatorJob,
      };
    case "work_started":
      return {
        title: `${name} started work on ${quoted}`,
        body: null,
        href: businessHire,
      };
    case "funded_hire_cancelled":
      return role === "business"
        ? {
            title: `${name} withdrew from your paid hire for ${quoted}`,
            body: "The money went back to your wallet.",
            href: businessHire,
          }
        : {
            title: `${name} cancelled your paid hire for ${theirs}`,
            body: "They cancelled before you started work, so nothing is due.",
            href: creatorJob,
          };
    case "work_submitted":
      return {
        title: `${name} submitted work for ${quoted}`,
        body: reviewBody(d.review_deadline_at),
        href: businessHire,
      };
    case "submission_denied":
      return {
        title: `${name} sent back your work for ${theirs}`,
        body: denialBody(d),
        href: creatorJob,
      };
    case "review_reminder": {
      const left =
        d.days_left === 1
          ? "About a day left"
          : typeof d.days_left === "number"
            ? `${d.days_left} days left`
            : "Time is running out";
      return {
        title: `${left} to review ${name}’s work for ${quoted}`,
        body: reviewBody(d.review_deadline_at),
        href: businessHire,
      };
    }
    case "dispute_opened":
      return {
        title: `${name} opened a dispute about ${role === "business" ? quoted : theirs}`,
        body: null,
        href: disputePage,
      };
    case "dispute_statement":
      return {
        title: `${name} added to the dispute about ${role === "business" ? quoted : theirs}`,
        body: null,
        href: disputePage,
      };
    case "dispute_withdrawn":
      return {
        title: `${name} withdrew their dispute about ${role === "business" ? quoted : theirs}`,
        body: "The hire is back where it was.",
        href: disputePage,
      };
    case "engagement_settled":
      // A creator who withdraws after starting settles the hire as a refund
      // at their fault. Only the business hears it (the creator was the
      // actor), so it reads as a withdrawal, not a settlement. An admin's
      // fault refund has the same outcome, so only settled_by tells them apart.
      if (
        role === "business" &&
        d.status === "refunded" &&
        d.outcome === "refund_creator_fault" &&
        d.settled_by === "influencer"
      ) {
        return {
          title: `${name} withdrew from ${quoted}`,
          body: settlementBody(d, role),
          href: businessHire,
        };
      }
      return {
        title: title
          ? `“${title}” was ${d.status === "auto_released" ? "released automatically" : "settled"}`
          : d.status === "auto_released"
            ? "A hire was released automatically"
            : "A hire was settled",
        body: settlementBody(d, role),
        href: role === "business" ? businessHire : creatorJob,
      };
    case "payout_paid":
      return {
        title: `Your ${payoutAmount(d)}payout was sent`,
        body: payoutSentBody(d),
        href: "/wallet",
      };
    case "payout_failed":
      return {
        title: `Your ${payoutAmount(d)}payout didn’t go through`,
        body: "The money is back in your wallet. You can ask for it again.",
        href: "/wallet",
      };
    case "payout_rejected":
      return {
        title: `We couldn’t approve your ${payoutAmount(d)}payout`,
        body: text(d.decision_reason),
        href: "/wallet",
      };
    case "kickoff_done":
      return {
        title: `${name} confirmed the kickoff for ${quoted}`,
        body: "They’ve read the brief and started on the work.",
        href: businessHire,
      };
    case "checkpoint_done": {
      const due = text(d.due_on);
      return {
        title: `${name} sent a progress checkpoint for ${quoted}`,
        body: due ? `It was due on ${formatDay(due)}.` : null,
        href: businessHire,
      };
    }
    case "checkpoint_late": {
      const due = text(d.due_on);
      const dueLine = due ? `It was due on ${formatDay(due)}. ` : "";
      return {
        title:
          d.kickoff === true
            ? `${name} confirmed the kickoff for ${quoted}, after it was due`
            : `${name} sent a late progress checkpoint for ${quoted}`,
        body: `${dueLine}It’s recorded as late. No money is held back because of a missed checkpoint.`,
        href: businessHire,
      };
    }
    case "click_cap_reached": {
      const cap = typeof d.cap === "number" ? d.cap : null;
      const earned = kobo(d.earned_kobo);
      return {
        title: `Your link for ${theirs} reached ${cap === null ? "its limit" : `${cap.toLocaleString("en-NG")} clicks`}`,
        body: `That’s the most this job pays${earned === null ? "" : `: ${formatNaira(earned)} before our fee`}. Your link still works, but more clicks won’t count.`,
        href: creatorJob,
      };
    }
    case "clicks_stopped": {
      const settles = text(d.settles_at);
      return {
        title: `${name} withdrew from ${quoted}`,
        body: `Their link stopped counting. They’re paid for the clicks so far when this settles${settles ? ` on ${formatDateTime(settles)}` : ""}; the rest comes back to your wallet.`,
        href: businessHire,
      };
    }
    case "click_hold_started": {
      const settles = text(d.settles_at);
      const when = settles ? formatDateTime(settles) : "in 3 days";
      const billable = typeof d.billable === "number" ? d.billable : null;
      const earned = kobo(d.earned_kobo);
      const counted =
        billable === null
          ? ""
          : `${billable.toLocaleString("en-NG")} ${billable === 1 ? "click" : "clicks"} counted${earned === null ? "" : `, worth ${formatNaira(earned)}`}. `;
      return {
        title: `Clicks are in for ${role === "business" ? quoted : theirs}`,
        body:
          role === "business"
            ? `${counted}It settles on ${when}. If something looks wrong, raise it before then.`
            : `${counted}You’ll be paid on ${when}, less our fee.`,
        href: role === "business" ? businessHire : creatorJob,
      };
    }
    case "payment_stranded": {
      const amount = kobo(d.amount_kobo);
      return {
        title: `Your payment ${amount === null ? "" : `of ${formatNaira(amount)} `}arrived, but this hire could not be started`,
        body: "The money is in your Pitchype wallet.",
        href: "/business/wallet",
      };
    }
    case "identity_verified":
      return {
        title: "Your identity is confirmed",
        body: null,
        href: "/account#identity",
      };
    case "identity_needs_review":
      return {
        title: "We’re taking a closer look",
        body: "This usually takes 1–2 working days.",
        href: "/account#identity",
      };
    case "identity_failed":
      return {
        title: "We couldn’t confirm your identity",
        body: identityFailureLine(text(d.kind), text(d.reason)),
        href: "/account#identity",
      };
    case "new_message": {
      const count = typeof d.count === "number" && d.count > 1 ? d.count : 1;
      const conversationId = text(d.conversation_id);
      return {
        title:
          count > 1
            ? `${count} new messages from ${name}`
            : `New message from ${name}`,
        body: text(d.preview),
        href: conversationId ? `/inbox/${conversationId}` : "/inbox",
      };
    }
    case "campaign_approved":
      return {
        title: `${quoted.replace(/^y/, "Y")} is live`,
        body: "We approved it, and creators can apply now.",
        href: businessCampaign,
      };
    case "campaign_sent_back":
      return {
        title: `${quoted.replace(/^y/, "Y")} needs changes`,
        body: note,
        href: businessCampaign,
      };
    case "campaign_taken_down":
      return {
        title: `We took down ${quoted}`,
        body: note,
        href: businessCampaign,
      };
    case "verification_approved":
      return {
        title: `Your ${platformLabel(d.platform)} account is verified`,
        body: null,
        href: "/profile",
      };
    case "verification_rejected":
      return {
        title: `We couldn’t verify your ${platformLabel(d.platform)} account`,
        body: "Check the code is in your bio, then try again.",
        href: "/profile",
      };
    case "profile_hidden":
      return {
        title: "Your profile is hidden from the directory",
        body: note,
        href: "/profile",
      };
    case "portfolio_sample_hidden": {
      // The admin's reason is the second line (null if missing, never blank).
      const caption = text(d.caption);
      return {
        title: caption
          ? `We took down a work sample: “${caption}”`
          : "We took down one of your work samples",
        body: note,
        href: "/profile#samples",
      };
    }
    case "cover_removed":
      return {
        title: "We removed your cover picture",
        body: note,
        href: "/profile#cover",
      };
    case "profile_restored":
      return {
        title: "Your profile is back in the directory",
        body: null,
        href: "/profile",
      };
    case "appeal_answered":
      return {
        title: "We answered your appeal",
        body: null,
        href: "/account/standing",
      };
    default:
      return null;
  }
}

/** What the business is asked to do with a new submission, and by when. */
function reviewBody(deadline: unknown): string {
  const when = text(deadline);
  return when
    ? `Review it by ${formatDateTime(when)}. After that it’s released to them automatically.`
    : "If you don’t respond within 7 days, it’s released to them automatically.";
}

/** The reasons for a denial, then what the creator can do next. */
function denialBody(d: Record<string, unknown>): string | null {
  const reasons = Array.isArray(d.reasons)
    ? d.reasons.filter((r): r is string => typeof r === "string")
    : [];
  const left = typeof d.rounds_left === "number" ? d.rounds_left : null;
  const next =
    left === null
      ? null
      : left > 0
        ? `You can resubmit (${left} ${left === 1 ? "time" : "times"} left) or open a dispute.`
        : "You can’t resubmit again, but you can open a dispute.";
  const line = [reasons.join(" · "), next].filter(Boolean).join(" ");
  return line === "" ? null : line;
}

function platformLabel(value: unknown): string {
  return typeof value === "string" && value in PLATFORM_RULES
    ? PLATFORM_RULES[value as Platform].label
    : "social";
}

/** "₦47,500 " ready to sit before "payout", or "" if the amount is missing. */
function payoutAmount(d: Record<string, unknown>): string {
  const amount = kobo(d.amount_kobo);
  return amount === null ? "" : `${formatNaira(amount)} `;
}

/**
 * What reaches the bank. The notification stores only the gross amount taken
 * from the wallet, so the transfer cost is worked out again with
 * transferFee(), the same table the creator saw when asking (fees.ts mirrors
 * fee_config; if they ever differ, this line is what drifts, not the money).
 */
function payoutSentBody(d: Record<string, unknown>): string {
  const amount = kobo(d.amount_kobo);
  if (amount === null || amount <= 0) {
    return "It’s on its way to your bank account.";
  }
  const fee = transferFee(amount);
  if (fee >= amount) return "It’s on its way to your bank account.";
  return `${formatNaira(amount - fee)} is on its way to your bank after the ${formatNaira(fee)} transfer cost.`;
}

function kobo(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** What an admin settlement did with the money, from one side's point of view. */
function settlementBody(d: Record<string, unknown>, role: Role): string | null {
  const released = kobo(d.released_kobo);
  const refunded = kobo(d.refunded_kobo);
  if (released === null || refunded === null) return null;

  const business = role === "business";
  const toBusiness = business
    ? `${formatNaira(refunded)} went back to your wallet`
    : `${formatNaira(refunded)} went back to the business`;

  if (business) {
    if (released > 0 && refunded > 0) {
      return `${formatNaira(released)} was released to the creator, and ${toBusiness}.`;
    }
    if (released > 0)
      return `${formatNaira(released)} was released to the creator.`;
    return `${toBusiness}.`;
  }

  // The creator is told what reached their wallet. `released_kobo` is the
  // amount that left escrow, before our fee, so it is never shown as the
  // wallet credit. Notices from before the net was recorded fall back to a
  // line that does not claim an amount for the wallet.
  if (released === 0) return `${toBusiness}. Nothing is due to you.`;
  const net = kobo(d.creator_net_kobo);
  const fee = kobo(d.creator_fee_kobo);
  let line: string;
  if (net === null || fee === null) {
    line = `${formatNaira(released)} was released for you. Your wallet gets that less our fee: see the exact amount in your wallet.`;
  } else if (refunded > 0) {
    line = `${formatNaira(net)} was added to your wallet: ${formatNaira(released)} of the job price less our ${formatNaira(fee)} fee.`;
  } else {
    line = `${formatNaira(net)} was added to your wallet: the ${formatNaira(released)} job price less our ${formatNaira(fee)} fee.`;
  }
  return refunded > 0 ? `${line} ${toBusiness}.` : line;
}
