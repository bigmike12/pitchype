// Did an admin's settlement do what they asked? settle_engagement quietly does
// nothing on a hire that is already settled, so the screen compares the hire's
// stored outcome with the request instead of saying "Settled" for something
// that did not happen. No framework imports, so node tests cover it.

const OUTCOME_WORDS: Record<string, string> = {
  release: "released to the creator",
  refund: "refunded to the business",
  split: "split between the creator and the business",
  refund_creator_fault: "refunded to the business, creator at fault",
};

export function alreadySettledMessage(storedOutcome: string | null): string {
  const words = storedOutcome ? OUTCOME_WORDS[storedOutcome] : undefined;
  return `This hire was already settled${words ? ` (${words})` : ""} — nothing changed.`;
}

/**
 * True when the stored settlement is the one requested. A split of the whole
 * price is stored as a release and a split of nothing as a refund (see
 * settle_engagement_internal), so those count as matching too.
 */
export function settlementMatchesRequest(
  stored: { settleOutcome: string | null; releasedKobo: number | null },
  request: {
    outcome: string;
    releaseKobo: number | null;
    agreedPriceKobo: number;
  },
): boolean {
  let expected = request.outcome;
  if (request.outcome === "split") {
    if (request.releaseKobo === request.agreedPriceKobo) expected = "release";
    else if (request.releaseKobo === 0) expected = "refund";
  }
  if (stored.settleOutcome !== expected) return false;
  if (expected === "split") return stored.releasedKobo === request.releaseKobo;
  return true;
}
