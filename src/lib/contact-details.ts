// Spots contact details in text people publish on Pitchype (campaign briefs,
// creator bios). Deals that move to WhatsApp or a phone call skip escrow, the
// biggest leak in a marketplace (CLAUDE.md §10), so these are refused and
// people talk through Pitchype instead. Deliberately simple: it catches the
// common cases, not determined evasion.

const CHECKS: { what: string; pattern: RegExp }[] = [
  {
    what: "WhatsApp link",
    pattern: /\b(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\b/i,
  },
  { what: "Telegram link", pattern: /\b(?:t\.me|telegram\.me)\//i },
  // Something before the @, so "@brightside" mentions are fine.
  { what: "email address", pattern: /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}\b/i },
  // 10 to 14 digits, optionally split by spaces, dots or dashes: covers
  // 0803 123 4567 and +234 803 123 4567, but not prices (₦50,000) or dates.
  { what: "phone number", pattern: /(?:\+\s?)?\b\d(?:[\s.-]?\d){9,13}\b/ },
];

/** What kind of contact detail the text contains, or null if none. */
export function findContactDetails(text: string): string | null {
  for (const { what, pattern } of CHECKS) {
    if (pattern.test(text)) return what;
  }
  return null;
}
