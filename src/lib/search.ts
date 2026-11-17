// The words someone typed into a list's search box, from the URL.

/** The longest search we pass on; the database uses at most this many too. */
export const SEARCH_MAX = 60;

/** Trimmed, single-spaced and capped; undefined when there is nothing to search. */
export function parseSearch(
  value: string | string[] | undefined,
): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value) ?? "";
  const words = text.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX).trim();
  return words === "" ? undefined : words;
}
