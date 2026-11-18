// Every refusal the Stage 5 to 7 database functions raise (errcode P0001, the
// code as the message), with the words people see. One list for
// applications, payments, reviewing work, disputes, chat and account
// standing, because several codes (not_allowed, activity_paused,
// account_suspended) are shared.
// No framework imports, so it can be unit-tested.

const REFUSAL_TEXT = {
  // Applying and hiring
  campaign_full: "All places on this campaign are taken.",
  campaign_closed: "This campaign isn’t taking applications any more.",
  not_eligible: "You don’t meet this campaign’s requirements yet.",
  already_applied: "You’ve already applied to this campaign.",
  profile_not_listed:
    "Publish your profile first, so the business can see who’s applying.",
  price_invalid: "Enter a whole number of naira, ₦5,000 or more.",
  price_fixed_per_click:
    "The price per click is fixed on this campaign, so there’s no price to propose.",
  note_too_long: "Keep your note to 500 characters or fewer.",
  application_locked: "This application has already been decided.",
  no_such_application: "We couldn’t find that application.",
  price_changed:
    "The creator changed their price since you opened this page. Check the new price and approve again.",
  creator_unavailable: "This creator can’t be hired right now.",
  engagement_locked: "This hire can’t be changed any more.",
  no_such_engagement: "We couldn’t find that hire.",
  no_such_campaign: "We couldn’t find that campaign.",
  places_below_held:
    "You’ve already hired more creators than that. Keep at least that many places.",
  // Paying for a hire
  payment_in_progress:
    "A payment for this hire is still going through. Try again in 30 minutes.",
  payment_mismatch:
    "The amount paid didn’t match this hire, so the hire isn’t paid yet. If your card was charged, contact us and we’ll sort it out.",
  not_enough_balance:
    "Your wallet doesn’t cover this hire. Pay the rest by card.",
  wallet_covers_total:
    "Your wallet covers this hire. Pay from your wallet instead.",
  fee_notice_required:
    "Tick the box to confirm you’ve read that our fee isn’t refundable.",
  // Settling a hire (admins)
  release_invalid:
    "Release a whole number of naira, from ₦0 up to the hire’s price.",
  settle_reason_required: "Write a reason of up to 500 characters.",
  escrow_mismatch:
    "This hire’s escrow doesn’t match its price. Open its money trail to see why.",
  // Submitting and reviewing work
  no_rounds_left:
    "You’ve used all 3 resubmissions. You can open a dispute or withdraw from the job.",
  review_closed:
    "The review time for this work has ended, so the money has been released to the creator.",
  proof_required: "Add at least one link or one screenshot.",
  proof_invalid:
    "Check your proof: up to 10 links starting with http:// or https://, each up to 500 characters, up to 5 different screenshots, and a note of up to 1,000 characters.",
  reasons_required: "Give 1 to 5 reasons, each 3 to 500 characters.",
  dispute_open:
    "There’s an open dispute on this hire. An admin will decide it.",
  not_your_file: "One of those screenshots can’t be used. Upload it again.",
  // Disputes
  dispute_not_allowed_yet:
    "You can open a dispute about missing work once the deliver-by date has passed and the creator has had a week since starting.",
  dispute_reason_invalid: "Explain the problem in 20 to 2,000 characters.",
  statement_invalid: "Write a statement of up to 2,000 characters.",
  no_such_dispute: "We couldn’t find that dispute.",
  dispute_closed: "This dispute has already been closed.",
  contact_details: "Keep contact details out of disputes.",
  // Payouts
  no_bank_account: "Add a bank account before asking for a payout.",
  payout_too_small: "The smallest payout is ₦1,000.",
  payout_fee_too_high:
    "The transfer fee would take the whole payout. Ask for a larger amount.",
  payout_not_enough_balance:
    "Your wallet doesn’t hold that much. Ask for your balance or less.",
  no_such_payout: "We couldn’t find that payout.",
  payout_not_pending: "This payout has already been decided.",
  payout_reason_required: "Write a reason of up to 500 characters.",
  // Shared
  not_allowed: "You can’t do this with this person.",
  activity_paused:
    "New activity is paused on your account for now. See your account standing.",
  account_suspended:
    "Your account is suspended while we review it. See your account standing.",
  // Chat
  message_length: "Write a message of up to 2,000 characters.",
  // Standing and appeals
  nothing_to_appeal: "There’s nothing on your account to appeal.",
  appeal_open: "You already have an appeal waiting for an answer.",
  appeal_too_soon: "You can send one appeal a day. Try again tomorrow.",
  reason_required: "Give a reason of 2 to 200 characters.",
  answer_required: "Write an answer of 2 to 1,000 characters.",
  appeal_not_open: "This appeal has already been answered.",
  no_such_strike: "We couldn’t find that strike.",
} as const;

export type Refusal = keyof typeof REFUSAL_TEXT;

export const REFUSALS = Object.keys(REFUSAL_TEXT) as Refusal[];

export function isRefusal(value: string): value is Refusal {
  return Object.hasOwn(REFUSAL_TEXT, value);
}

export function refusalText(reason: Refusal): string {
  return REFUSAL_TEXT[reason];
}
