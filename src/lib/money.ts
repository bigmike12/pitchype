// Money is stored and computed as integer kobo (CLAUDE.md §6.1). Formatting
// happens only at the edge, here.

export const KOBO_PER_NAIRA = 100;

const wholeNaira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const nairaAndKobo = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats kobo as naira, e.g. 5_250_000 → "₦52,500". Shows kobo only when there are any. */
export function formatNaira(kobo: number): string {
  if (!Number.isInteger(kobo)) {
    throw new Error(`Amounts must be whole kobo, got ${kobo}`);
  }
  const formatter = kobo % KOBO_PER_NAIRA === 0 ? wholeNaira : nairaAndKobo;
  return formatter.format(kobo / KOBO_PER_NAIRA);
}
