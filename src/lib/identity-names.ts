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
