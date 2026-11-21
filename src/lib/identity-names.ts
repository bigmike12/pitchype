// Name matching for identity checks (design §5.4). Pure functions. Anything
// fuzzier than these rules is a mismatch; the person retries with the exact
// name instead of us guessing.

/** Upper-case, accents removed, punctuation to spaces, spaces collapsed. */
export function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * The entered first and last names must both be among the record's names, in
 * any order. Middle names are optional on either side, so a single name never
 * matches (it has no separate last name).
 */
export function personNamesMatch(entered: string, onRecord: string): boolean {
  const enteredTokens = normaliseName(entered).split(" ").filter(Boolean);
  if (enteredTokens.length < 2) return false;
  const recordTokens = new Set(normaliseName(onRecord).split(" "));
  const first = enteredTokens[0];
  const last = enteredTokens[enteredTokens.length - 1];
  return recordTokens.has(first) && recordTokens.has(last);
}

const COMPANY_WORDS: Record<string, string> = {
  LTD: "LIMITED",
  ENTERPRISE: "ENTERPRISES",
  ENT: "ENTERPRISES",
  NIG: "NIGERIA",
  CO: "COMPANY",
};

function companyTokens(value: string): string[] {
  const tokens = normaliseName(value.replace(/&/g, " AND "))
    .split(" ")
    .filter(Boolean)
    .map((token) => COMPANY_WORDS[token] ?? token);
  if (tokens[0] === "THE") tokens.shift();
  return tokens;
}

/** Equal after the usual short forms are unified and a leading "The" dropped. */
export function companyNamesMatch(entered: string, onRecord: string): boolean {
  const a = companyTokens(entered);
  const b = companyTokens(onRecord);
  return a.length > 0 && a.join(" ") === b.join(" ");
}

/**
 * The legal name a person types before a check: 3 to 200 characters with at
 * least a first and a last name. The widget is prefilled with the first and
 * last words; the full name is what the record's name is compared with.
 */
export function splitLegalName(
  value: string,
):
  | { ok: true; full: string; firstName: string; lastName: string }
  | { ok: false } {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const full = words.join(" ");
  if (words.length < 2 || full.length < 3 || full.length > 200) {
    return { ok: false };
  }
  return {
    ok: true,
    full,
    firstName: words[0],
    lastName: words[words.length - 1],
  };
}

/** A CAC registration number as typed ("RC 1234567", "BN-1234567"): the 3 to 10 digits, or not ok. */
export function parseRegistrationNumber(
  value: string,
): { ok: true; digits: string } | { ok: false } {
  const match = /^(?:RC|BN|IT|LP|LLP)?[\s-]*(\d{3,10})$/.exec(
    value.trim().toUpperCase().replace(/\s+/g, " "),
  );
  return match ? { ok: true, digits: match[1] } : { ok: false };
}
