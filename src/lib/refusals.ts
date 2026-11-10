// Every refusal the Stage 5 database functions raise (errcode P0001, the
// code as the message), with the words people see. One list for
// applications, chat and account standing, because several codes
// (not_allowed, activity_paused, account_suspended) are shared.
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
