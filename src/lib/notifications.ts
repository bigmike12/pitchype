// The words and links for notifications. The database stores what happened
// (a kind and the facts, see the create_notifications migration); this file
// turns that into what a person reads, so copy changes need no migration.

import { PLATFORM_RULES, type Platform } from "./creator-profile.ts";
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
    case "engagement_settled":
      return {
        title: title ? `“${title}” was settled` : "A hire was settled",
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
    case "payment_stranded": {
      const amount = kobo(d.amount_kobo);
      return {
        title: `Your payment ${amount === null ? "" : `of ${formatNaira(amount)} `}arrived, but this hire could not be started`,
        body: "The money is in your Pitchype wallet.",
        href: "/business/wallet",
      };
    }
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
  const toCreator = business
    ? `${formatNaira(released)} was released to the creator`
    : `${formatNaira(released)} was released to your wallet, less our fee`;
  const toBusiness = business
    ? `${formatNaira(refunded)} went back to your wallet`
    : `${formatNaira(refunded)} went back to the business`;

  if (released > 0 && refunded > 0) return `${toCreator}, and ${toBusiness}.`;
  if (released > 0) return `${toCreator}.`;
  return business
    ? `${toBusiness}.`
    : `${toBusiness}. Nothing is due to you.`;
}
