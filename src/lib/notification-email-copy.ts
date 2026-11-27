// The words for notification emails (design:
// docs/superpowers/specs/2026-11-27-richer-notification-emails-design.md).
// The bell keeps its one-line words in notifications.ts; an email has room to
// say what happened, what it means and what happens next. The link always
// comes from describeNotification, so the bell and the email lead to the same
// page.
//
// Tone: upbeat on good news, plain and calm on bad news. Never jokey about
// money or enforcement, no emoji, no amounts the notification doesn't carry,
// a missed checkpoint never costs money, and an identity review never says why.

import { formatDay } from "./campaign.ts";
import { formatDateTime } from "./creator-profile.ts";
import { formatNaira } from "./money.ts";
import {
  describeNotification,
  identityFailureLine,
  kobo,
  payoutAmount,
  payoutSentBody,
  platformLabel,
  reviewBody,
  settlementBody,
  type NotificationRow,
} from "./notifications.ts";
import { CONTACT_EMAIL } from "./site.ts";

type Role = "business" | "influencer";

export type EmailBlock =
  | { type: "p"; text: string }
  | { type: "list"; title: string; items: string[] }
  | { type: "quote"; label: string; text: string };

export type EmailCopy = {
  /** Plain text; the subject line and the heading in the email. */
  subject: string;
  /** What the inbox shows after the subject: the first paragraph. */
  preview: string;
  blocks: EmailBlock[];
  /** The button's words: the action, never "Open in Pitchype". */
  button: string;
  href: string;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const p = (value: string): EmailBlock => ({ type: "p", text: value });

/** A labelled quote, or nothing when there is no text to quote. */
const quote = (label: string, value: string | null): EmailBlock[] =>
  value ? [{ type: "quote", label, text: value }] : [];

const list = (title: string, items: string[]): EmailBlock => ({
  type: "list",
  title,
  items,
});

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-NG")} ${count === 1 ? one : many}`;

/** Every word of an email on its own lines, for tests and the text part. */
export function emailText(copy: EmailCopy): string {
  const lines = [copy.subject];
  for (const block of copy.blocks) {
    if (block.type === "p") lines.push(block.text);
    if (block.type === "quote") lines.push(`${block.label}: ${block.text}`);
    if (block.type === "list") lines.push(block.title, ...block.items);
  }
  lines.push(copy.button);
  return lines.join("\n");
}

/**
 * The email for a notification, or null for a kind this version of the app
 * doesn't know (the bell leaves those out too).
 */
export function describeEmail(n: NotificationRow, role: Role): EmailCopy | null {
  const view = describeNotification(n, role);
  if (!view) return null;
  const copy = emailCopy(n, role);
  if (!copy) {
    // A kind the bell knows but the email doesn't yet: the bell's words.
    return {
      subject: view.title,
      preview: view.body ?? view.title,
      blocks: [p(view.body ?? view.title)],
      button: "See it on Pitchype",
      href: view.href,
    };
  }
  const first = copy.blocks.find((b) => b.type === "p");
  return {
    subject: copy.subject.replace(/\s+/g, " ").trim(),
    preview: first?.type === "p" ? first.text : copy.subject,
    blocks: copy.blocks,
    button: copy.button,
    href: view.href,
  };
}

type Draft = { subject: string; blocks: EmailBlock[]; button: string };

function emailCopy(n: NotificationRow, role: Role): Draft | null {
  const d = n.data;
  const business = role === "business";
  const name = text(d.name) ?? (business ? "The creator" : "The business");
  // Mid-sentence: "the creator" rather than "The creator".
  const them = text(d.name) ?? (business ? "the creator" : "the business");
  const title = text(d.campaign_title);
  const quoted = title ? `“${title}”` : "your campaign";
  const theirs = title ? `“${title}”` : "the campaign";
  const which = business ? quoted : theirs;
  const note = text(d.note);
  const kickoff = d.kickoff === true;
  const what = kickoff ? "kickoff" : "checkpoint";

  switch (n.kind) {
    // Applications and hiring ---------------------------------------------
    case "application_received":
      return {
        subject: `New applicant: ${name} wants in on ${quoted}`,
        blocks: [
          p(`Someone’s raised their hand. ${name} has applied to ${quoted} and is waiting to hear from you.`),
          p("Have a look at their profile, their price and their note. If they’re a fit, shortlist them, message them or hire them straight away."),
          list("When you hire", [
            "You have 48 hours to pay.",
            "Your payment is held in escrow, not sent to them, until the work is done.",
          ]),
        ],
        button: "Review applicants",
      };
    case "application_updated":
      return {
        subject: `${name} updated their application to ${quoted}`,
        blocks: [
          p(`${name} has changed their price or note on ${quoted}. Worth a fresh look before you decide.`),
          p("You always hire at the price you saw. If it changes while you’re looking, we’ll ask you to check it again."),
        ],
        button: "See the application",
      };
    case "application_withdrawn":
      return {
        subject: `${name} withdrew from ${quoted}`,
        blocks: [
          p(`${name} has withdrawn their application to ${quoted}, so they’re out of the running this time.`),
          p("Nothing was paid, so there’s nothing to sort out. Your other applicants are right where you left them."),
        ],
        button: "See applicants",
      };
    case "application_shortlisted":
      return {
        subject: `You’re on the shortlist for ${theirs}`,
        blocks: [
          p(`Nice one. ${name} has shortlisted you for ${theirs}, so you’ve caught their eye.`),
          p("There’s nothing to do just yet. They may message you with questions, so keep an eye on your inbox, and make sure your profile shows your best work."),
        ],
        button: "See the campaign",
      };
    case "application_hired":
      return {
        subject: `You’re hired! ${name} picked you for ${theirs}`,
        blocks: [
          p(`Good news: ${name} wants you on ${theirs}.`),
          p("They have 48 hours to pay. When they do, the money is held safely in escrow and we’ll email you that it’s time to start."),
          list("What happens next", [
            `${name} pays within 48 hours.`,
            "We tell you the money is held, and you press Start work.",
            "You deliver, they review, and you get paid.",
          ]),
          p("One rule: don’t start before they’ve paid. Escrow is what protects you."),
        ],
        button: "See the job",
      };
    case "application_passed":
      return {
        subject: `An update on your application to ${theirs}`,
        blocks: [
          p(`${name} has decided not to go ahead with your application to ${theirs} this time.`),
          ...quote("Their note", note),
          p("It happens to everyone, and it’s rarely about talent: budget, timing and fit all play a part. There are more campaigns waiting for you."),
        ],
        button: "See the campaign",
      };
    case "hire_cancelled":
      return {
        subject: `${name} cancelled your hire for ${theirs}`,
        blocks: [
          p(`${name} has cancelled your hire for ${theirs} before paying for it.`),
          p("Because nothing was paid, no work was due and nothing is owed either way. It’s exactly why we ask you to wait for payment before you start."),
        ],
        button: "See the campaign",
      };
    case "hire_lapsed":
      return business
        ? {
            subject: `Your hire of ${name} for ${quoted} lapsed`,
            blocks: [
              p(`You hired ${name} for ${quoted}, but it wasn’t paid within 48 hours, so the hire lapsed and the place is open again.`),
              p(`Still keen? If ${name} applies again you can hire them again, or pick someone else from your applicants.`),
            ],
            button: "Open the hire",
          }
        : {
            subject: `${name}’s hire for ${theirs} lapsed`,
            blocks: [
              p(`${name} didn’t pay for ${theirs} within 48 hours, so the hire has lapsed. No work is due.`),
              p("Still interested? You can apply again from the campaign page, and they can hire you again."),
            ],
            button: "See the campaign",
          };

    // Money in escrow and the work -----------------------------------------
    case "hire_funded":
      return {
        subject: `You’re good to go: ${name} paid for ${theirs}`,
        blocks: [
          p(`The payment for ${theirs} is in and held safely in escrow. This is your green light.`),
          list("What happens next", [
            "Read the brief once more and press Start work, so they know you’re on it.",
            "Deliver what was agreed, on time.",
            "The money moves from escrow to your Pitchype wallet when the job is settled.",
          ]),
        ],
        button: "Start work",
      };
    case "work_started":
      return {
        subject: `${name} has started on ${quoted}`,
        blocks: [
          p(`${name} pressed Start work on ${quoted}. The job is officially under way.`),
          p("Your payment stays in escrow while they work. Got notes or questions? Message them from the hire page."),
        ],
        button: "See the hire",
      };
    case "funded_hire_cancelled":
      return business
        ? {
            subject: `${name} withdrew from ${quoted}`,
            blocks: [
              p(`${name} has withdrawn from your paid hire for ${quoted} before starting work.`),
              p("The money has gone back to your Pitchype wallet, and it’s used first the next time you pay for a hire. Your applicants are still there if you’d like to hire someone else."),
            ],
            button: "See the hire",
          }
        : {
            subject: `${name} cancelled your hire for ${theirs}`,
            blocks: [
              p(`${name} cancelled your paid hire for ${theirs} before you started work.`),
              p("Since you hadn’t started, nothing is due from you and there’s nothing to settle on your side."),
            ],
            button: "See the job",
          };
    case "work_submitted":
      return {
        subject: `${name} sent in their work for ${quoted}`,
        blocks: [
          p(`${name} has sent in their work for ${quoted}, with proof for you to check.`),
          p(reviewBody(d.review_deadline_at)),
          list("Your options", [
            "Happy with it? Accept, and the payment is released to them.",
            "Something not right? Send it back with your reasons, and they can fix it.",
            "No answer by the deadline? It’s released to them automatically.",
          ]),
        ],
        button: "Review the work",
      };
    case "submission_denied": {
      const reasons = Array.isArray(d.reasons)
        ? d.reasons.filter((r): r is string => typeof r === "string" && r.trim() !== "")
        : [];
      const left = typeof d.rounds_left === "number" ? d.rounds_left : null;
      const next =
        left === null
          ? "You can fix it and resubmit, or open a dispute if you think the work already meets the brief. An admin would then decide."
          : left > 0
            ? `You can fix it and resubmit (${left} more ${left === 1 ? "time" : "times"}), or open a dispute if you think the work already meets the brief. An admin would then decide.`
            : "You’ve used all your resubmissions, but you can still open a dispute if you think the work meets the brief. An admin decides every dispute.";
      return {
        subject: `Changes needed on ${theirs}`,
        blocks: [
          p(`${name} has reviewed your work for ${theirs} and sent it back.`),
          ...(reasons.length > 0 ? [list("What they said", reasons)] : []),
          p(next),
          p("Your payment stays in escrow while this is sorted out."),
        ],
        button: "See the feedback",
      };
    }
    case "review_reminder": {
      const left =
        d.days_left === 1
          ? "About a day left"
          : typeof d.days_left === "number"
            ? `${d.days_left} days left`
            : "Time is running out";
      return {
        subject: `${left} to review ${name}’s work for ${quoted}`,
        blocks: [
          p(`A quick nudge: ${name}’s work for ${quoted} is still waiting for your review.`),
          p(reviewBody(d.review_deadline_at)),
          p("Accept it if you’re happy, or send it back with your reasons."),
        ],
        button: "Review the work",
      };
    }

    // Disputes --------------------------------------------------------------
    case "dispute_opened":
      return {
        subject: `${name} opened a dispute about ${which}`,
        blocks: [
          p(`${name} has opened a dispute about ${which}. Nothing is settled while it’s open: the payment stays in escrow.`),
          p("Please give your side within 3 days. Stick to the facts: what was agreed, what was delivered, and when."),
          list("What happens next", [
            `You and ${them} each add your side on the dispute page.`,
            "An admin reviews everything, usually within 5 working days.",
            "They decide: a release, a refund or a split, with a written reason.",
          ]),
        ],
        button: "Respond to the dispute",
      };
    case "dispute_statement":
      return {
        subject: `${name} added to the dispute about ${which}`,
        blocks: [
          p(`${name} has added a new statement to the dispute about ${which}.`),
          p("Have a read, and reply if there’s anything you want the admin to know. The payment stays in escrow until an admin decides."),
        ],
        button: "Read their statement",
      };
    case "dispute_withdrawn":
      return {
        subject: `${name} withdrew their dispute about ${which}`,
        blocks: [
          p(`${name} has withdrawn the dispute about ${which}.`),
          p("The hire is back where it was before the dispute, so you can pick up from there."),
        ],
        button: "See the hire",
      };

    // Settlement and payouts ------------------------------------------------
    case "engagement_settled":
      return settledCopy(d, role, name, which);
    case "payout_paid":
      return {
        subject: `Your ${payoutAmount(d)}payout is on its way`,
        blocks: [
          p(payoutSentBody(d)),
          p(`It usually lands within minutes. If you don’t see it within 24 hours, write to us at ${CONTACT_EMAIL} and we’ll chase it.`),
          p("Thanks for doing great work on Pitchype."),
        ],
        button: "See your wallet",
      };
    case "payout_failed":
      return {
        subject: `Your ${payoutAmount(d)}payout didn’t go through`,
        blocks: [
          p("Your bank transfer didn’t go through, so the money is back in your Pitchype wallet. Nothing is lost."),
          p("This usually comes down to the bank details. Check the account on your wallet page, then ask for the payout again."),
        ],
        button: "See your wallet",
      };
    case "payout_rejected":
      return {
        subject: `We couldn’t approve your ${payoutAmount(d)}payout`,
        blocks: [
          p("We’ve reviewed your payout request and couldn’t approve it this time. The money is back in your Pitchype wallet."),
          ...quote("Why", text(d.decision_reason)),
          p(`If something doesn’t look right, write to us at ${CONTACT_EMAIL} and we’ll take another look.`),
        ],
        button: "See your wallet",
      };
    case "payment_stranded": {
      const amount = kobo(d.amount_kobo);
      if (d.extra === true) {
        return {
          subject: `${amount === null ? "The extra you paid" : `The extra ${formatNaira(amount)} you paid`} is in your Pitchype wallet`,
          blocks: [
            p("Your hire is paid. Paystack collected a little more than the hire cost, so we kept only what was due and put the extra in your Pitchype wallet."),
            p("It’s used first the next time you pay for a hire."),
          ],
          button: "See your wallet",
        };
      }
      return {
        subject: "Your payment arrived, but the hire couldn’t start",
        blocks: [
          p(`Your payment${amount === null ? "" : ` of ${formatNaira(amount)}`} came through, but by then the hire could no longer be paid for. It may have lapsed, been cancelled, or been paid another way.`),
          p("The money is safe in your Pitchype wallet, and it’s used first the next time you pay for a hire."),
          p(`Would you rather have it back? Write to us at ${CONTACT_EMAIL} and we’ll sort it out.`),
        ],
        button: "See your wallet",
      };
    }

    // Checkpoints -----------------------------------------------------------
    case "kickoff_done":
      return {
        subject: `${name} kicked off ${quoted}`,
        blocks: [
          p(`${name} has confirmed the kickoff for ${quoted}: they’ve read the brief and they’re on it.`),
          p("You’ll hear from us when they send progress along the way."),
        ],
        button: "See the hire",
      };
    case "checkpoint_done": {
      const due = text(d.due_on);
      return {
        subject: `Progress update from ${name} on ${quoted}`,
        blocks: [
          p(`${name} has sent in a progress checkpoint for ${quoted}${due ? `, due on ${formatDay(due)}` : ""}.`),
          p("Take a look at what they’ve shared. Checkpoints are a record, not a sign-off, so there’s nothing to approve. If something worries you, message them."),
        ],
        button: "See the update",
      };
    }
    case "checkpoint_late": {
      const due = text(d.due_on);
      return {
        subject: kickoff
          ? `${name} confirmed the kickoff for ${quoted}, a little late`
          : `${name} sent a late progress checkpoint for ${quoted}`,
        blocks: [
          p(`${name} has ${kickoff ? "confirmed the kickoff" : "sent a progress checkpoint"} for ${quoted}, after it was due${due ? ` on ${formatDay(due)}` : ""}.`),
          p("It’s recorded as late on the hire. No money is held back because of a missed checkpoint, and the work carries on as agreed."),
        ],
        button: "See the update",
      };
    }
    case "checkpoint_reminder": {
      const due = text(d.due_at);
      const thing = kickoff ? "your kickoff" : "a checkpoint";
      return {
        subject: `${cap(thing)} for ${theirs} is due soon`,
        blocks: [
          p(`A friendly heads-up: ${thing} for ${theirs} is due ${due ? `by ${formatDateTime(due)} (Lagos time)` : "today"}.`),
          p(kickoff
            ? "The kickoff tells the business you’ve read the brief and started. It takes a minute."
            : "Share where things stand, with the evidence the campaign asks for."),
          p("Running behind? Send it anyway. Late is still accepted and recorded as late."),
        ],
        button: kickoff ? "Confirm the kickoff" : "Send your checkpoint",
      };
    }
    case "checkpoint_overdue":
      return business
        ? {
            subject: `${name}’s ${what} for ${quoted} is overdue`,
            blocks: [
              p(`${name}’s ${what} for ${quoted} hasn’t come in yet, and it’s now overdue.`),
              p("We’ve reminded them, and a quick message from you can help too. If it stays missing, you’ll be able to open a dispute."),
            ],
            button: "See the hire",
          }
        : {
            subject: `Your ${what} for ${theirs} is overdue`,
            blocks: [
              p(`Your ${what} for ${theirs} was due and hasn’t come in yet.`),
              p("Send it as soon as you can: it’s still accepted and recorded as late. No money is held back because of a missed checkpoint."),
              p("If something’s holding you up, tell the business in chat. A short update keeps everyone calm."),
            ],
            button: "Send it now",
          };
    case "checkpoint_warning": {
      const from = text(d.dispute_from);
      return {
        subject: `Still missing: your ${what} for ${theirs}`,
        blocks: [
          p(`Your ${what} for ${theirs} is still missing.`),
          p(`${from ? `From ${formatDateTime(from)}` : "Soon"}, the business can open a dispute about missing work. Sending it now, even late, closes that door.`),
          p("No money is held back because of a missed checkpoint."),
        ],
        button: "Send it now",
      };
    }
    case "checkpoint_dispute_available":
      return {
        subject: `You can now open a dispute on ${quoted}`,
        blocks: [
          p(`${name}’s ${what} for ${quoted} is more than 3 days overdue, and we’ve warned them.`),
          p("If you’d like an admin to step in, you can now open a dispute about missing work. You don’t have to: you can wait or message them first. If they send it in, the option closes again."),
          list("If you open one", [
            "You both give your side.",
            "An admin reviews and decides, usually within 5 working days.",
            "The payment stays in escrow until then.",
          ]),
        ],
        button: "Go to the dispute page",
      };

    // Pay per click ---------------------------------------------------------
    case "click_cap_reached": {
      const capCount = typeof d.cap === "number" ? d.cap : null;
      const earned = kobo(d.earned_kobo);
      return {
        subject: `Your link for ${theirs} hit its limit`,
        blocks: [
          p(`Your tracked link for ${theirs} has reached ${capCount === null ? "its limit" : plural(capCount, "click", "clicks")}. That’s the most this job pays${earned === null ? "" : `: ${formatNaira(earned)} before our fee`}.`),
          p("Your link still works, so nobody hits a dead end, but more clicks won’t count."),
          p("You’re paid after the click window closes and a 3-day hold, less our fee. Nice work."),
        ],
        button: "See the job",
      };
    }
    case "clicks_stopped": {
      const settles = text(d.settles_at);
      return {
        subject: `${name} withdrew from ${quoted}`,
        blocks: [
          p(`${name} has withdrawn from ${quoted}, so their link has stopped counting clicks.`),
          p(`They’re paid for the clicks counted so far when this settles${settles ? ` on ${formatDateTime(settles)}` : ""}. The rest comes back to your wallet.`),
        ],
        button: "See the hire",
      };
    }
    case "click_hold_started": {
      const settles = text(d.settles_at);
      const when = settles ? formatDateTime(settles) : "in 3 days";
      const billable = typeof d.billable === "number" ? d.billable : null;
      const earned = kobo(d.earned_kobo);
      const counted =
        billable === null
          ? []
          : [p(`${plural(billable, "click", "clicks")} counted${earned === null ? "" : `, worth ${formatNaira(earned)}`}.`)];
      return business
        ? {
            subject: `The clicks are in for ${quoted}`,
            blocks: [
              p(`The click window for ${quoted} has closed.`),
              ...counted,
              p(`It settles on ${when}: the creator is paid for the counted clicks, and any unspent budget comes back to your wallet.`),
              p("If something looks wrong, open a dispute before then."),
            ],
            button: "See the results",
          }
        : {
            subject: `The clicks are in for ${theirs}`,
            blocks: [
              p(`The click window for ${theirs} has closed.`),
              ...counted,
              p(`You’ll be paid on ${when}, less our fee. Nice work.`),
            ],
            button: "See the results",
          };
    }

    // Identity and feedback -------------------------------------------------
    case "identity_verified":
      return {
        subject: "You’re verified",
        blocks: [
          p("Your identity is confirmed. Thanks for taking the time."),
          p(business
            ? "You can publish campaigns and hire creators, and creators know they’re working with a real business."
            : "You can apply to campaigns and request payouts, and businesses know they’re working with a real person."),
        ],
        button: "See your account",
      };
    case "identity_needs_review":
      return {
        subject: "We’re taking a closer look",
        blocks: [
          p("Thanks for completing your identity check. Someone on our team needs to take a closer look before we can confirm it."),
          p("This usually takes 1–2 working days. There’s nothing you need to do right now; we’ll email you as soon as it’s done."),
        ],
        button: "See your account",
      };
    case "identity_failed":
      return {
        subject: "We couldn’t confirm your identity",
        blocks: [
          p("We weren’t able to confirm your identity this time."),
          p(identityFailureLine(text(d.kind), text(d.reason))),
          p("When you’re ready, you can try again from your account page."),
        ],
        button: "Try again",
      };
    case "feedback_shipped": {
      const number = typeof d.number === "number" ? `#${d.number} ` : "";
      const request = text(d.title);
      return {
        subject: "You asked, we built it",
        blocks: [
          p(request
            ? `Remember your request ${number}“${request}”? It’s live now.`
            : "Something you asked for is live now."),
          ...quote("From the team", note),
          p("Thanks for taking the time to tell us. Ideas like yours shape what we build next."),
        ],
        button: "See your requests",
      };
    }

    // Chat ------------------------------------------------------------------
    case "new_message": {
      const count = typeof d.count === "number" && d.count > 1 ? d.count : 1;
      return {
        subject: count > 1 ? `${count} new messages from ${name}` : `${name} sent you a message`,
        blocks: [
          p(`You have ${count > 1 ? `${count} unread messages` : "an unread message"} from ${name}.`),
          ...quote(count > 1 ? "Latest message" : "Message", text(d.preview)),
          p("Reply on Pitchype so your conversation, and any deal you agree, stays protected by escrow."),
        ],
        button: "Reply",
      };
    }

    // Campaigns -------------------------------------------------------------
    case "campaign_approved":
      return {
        subject: `${cap(quoted)} is live`,
        blocks: [
          p(`${cap(quoted)} is approved and open. Creators can find it and apply from now on.`),
          p("We’ll let you know as applications come in. Want a head start? Browse creators and message the ones you like."),
        ],
        button: "See your campaign",
      };
    case "campaign_sent_back":
      return {
        subject: `${cap(quoted)} needs a few changes`,
        blocks: [
          p(`Thanks for submitting ${quoted}. Before it goes live, our reviewer needs a few changes.`),
          ...quote("What to change", note),
          p("Make the edits and submit it again, and we’ll take another look."),
        ],
        button: "Edit your campaign",
      };
    case "campaign_taken_down":
      return {
        subject: `We took down ${quoted}`,
        blocks: [
          p(`We’ve taken down ${quoted}, so creators can no longer see it or apply.`),
          ...quote("Why", note),
          p(`If you think we got this wrong, write to us at ${CONTACT_EMAIL}.`),
        ],
        button: "See your campaign",
      };

    // Profile and standing --------------------------------------------------
    case "verification_approved": {
      const platform = platformLabel(d.platform);
      return {
        subject: `Your ${platform} account is verified`,
        blocks: [
          p(`Your ${platform} account now shows as Verified on your profile, with the follower count we confirmed.`),
          p("Some campaigns are open only to verified creators, so this opens more doors."),
        ],
        button: "See your profile",
      };
    }
    case "verification_rejected": {
      const platform = platformLabel(d.platform);
      return {
        subject: `We couldn’t verify your ${platform} account`,
        blocks: [
          p(`We checked your ${platform} account but couldn’t confirm it this time.`),
          p("The usual reason is the code: it needs to be in your bio, exactly as shown, when we look. Add it, then ask for verification again from your profile."),
        ],
        button: "Try again",
      };
    }
    case "profile_hidden":
      return {
        subject: "Your profile is hidden from the directory",
        blocks: [
          p("We’ve hidden your profile from the creator directory, so businesses can’t find it there for now."),
          ...quote("Why", note),
          p("Anything already agreed carries on: running jobs, money in escrow and payouts aren’t affected."),
          p(`If you think this is a mistake, write to us at ${CONTACT_EMAIL}.`),
        ],
        button: "See your profile",
      };
    case "portfolio_sample_hidden": {
      const caption = text(d.caption);
      return {
        subject: "We took down one of your work samples",
        blocks: [
          p(caption
            ? `We’ve taken down your work sample “${caption}”, so it no longer shows on your profile.`
            : "We’ve taken down one of your work samples, so it no longer shows on your profile."),
          ...quote("Why", note),
          p("The rest of your profile is unchanged, and you can add another sample in its place."),
        ],
        button: "See your samples",
      };
    }
    case "cover_removed":
      return {
        subject: "We removed your cover picture",
        blocks: [
          p("We’ve removed the cover picture from your profile."),
          ...quote("Why", note),
          p("You can upload a new one any time."),
        ],
        button: "Update your cover",
      };
    case "profile_restored":
      return {
        subject: "You’re back in the directory",
        blocks: [
          p("Good news: your profile is visible in the creator directory again, so businesses can find you."),
          p("Now’s a good time to freshen up your samples and rates."),
        ],
        button: "See your profile",
      };
    case "appeal_answered":
      return {
        subject: "We’ve answered your appeal",
        blocks: [
          p("We’ve reviewed your appeal and left our answer on your account’s standing page."),
          p("Have a read when you get a moment."),
        ],
        button: "Read our answer",
      };
    default:
      return null;
  }
}

/** A settled hire, from one side. Who settled it changes the opening line. */
function settledCopy(
  d: Record<string, unknown>,
  role: Role,
  name: string,
  which: string,
): Draft {
  const money = settlementBody(d, role);
  const moneyBlock = money ? [p(money)] : [];
  const released = kobo(d.released_kobo);
  const autoReleased = d.status === "auto_released";
  const by = text(d.settled_by);

  if (role === "business") {
    // The creator withdrew after starting: told as a withdrawal (see the bell).
    if (d.status === "refunded" && d.outcome === "refund_creator_fault" && by === "influencer") {
      return {
        subject: `${name} withdrew from ${which}`,
        blocks: [
          p(`${name} has withdrawn from ${which} after starting the work.`),
          ...moneyBlock,
          p("Your applicants are still there if you’d like to hire someone else."),
        ],
        button: "See the hire",
      };
    }
    return {
      subject: autoReleased ? `${cap(which)} was released automatically` : `${cap(which)} is settled`,
      blocks: [
        p(autoReleased
          ? `The 7-day review window for ${name}’s work on ${which} closed without an answer, so the payment was released to them automatically.`
          : by === "admin"
            ? `An admin has settled ${which}.`
            : `${cap(which)} is settled.`),
        ...moneyBlock,
        p("Thanks for hiring on Pitchype. When you’re ready for the next one, your creators are a click away."),
      ],
      button: "See the hire",
    };
  }

  if (released === null || released === 0) {
    return {
      subject: `${cap(which)} is settled`,
      blocks: [
        p(by === "admin" ? `An admin has settled ${which}.` : `${cap(which)} is settled.`),
        ...moneyBlock,
      ],
      button: "See the job",
    };
  }
  return {
    subject: autoReleased ? `Paid! ${cap(which)} was released to you` : `You’ve been paid for ${which}`,
    blocks: [
      p(autoReleased
        ? `The review window for ${which} closed without an answer, so the payment was released to you automatically.`
        : by === "business"
          ? `${name} accepted your work for ${which}. Nicely done.`
          : by === "admin"
            ? `An admin has settled ${which}.`
            : `${cap(which)} is settled.`),
      ...moneyBlock,
      p("You can send it to your bank from your wallet whenever you’re ready."),
    ],
    button: "See the payment",
  };
}
