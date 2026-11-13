// Checks that one hire's money adds up, from the ledger lines the audit
// returns. The ledger stores wallets, escrow and revenue as negative (what the
// platform owes or has earned) and cash and expenses as positive. No framework
// imports, so node tests cover it.

import { formatDateTime } from "./creator-profile.ts";
import type { EngagementTrail } from "./db/money.ts";
import { formatNaira } from "./money.ts";

type Group = EngagementTrail["groups"][number];

const FUNDING_EVENTS = new Set(["payment_received", "hire_funded"]);

function sumOf(groups: Group[], account: string, sign: 1 | -1): number {
  let total = 0;
  for (const g of groups) {
    for (const l of g.lines) {
      if (l.account === account && Math.sign(l.amountKobo) === sign) {
        total += Math.abs(l.amountKobo);
      }
    }
  }
  return total;
}

export function checkTrail(trail: EngagementTrail): {
  ok: boolean;
  problems: string[];
} {
  const problems: string[] = [];
  const e = trail.engagement;

  for (const g of trail.groups) {
    const sum = g.lines.reduce((total, l) => total + l.amountKobo, 0);
    if (sum !== 0) {
      problems.push(
        `The lines for “${g.eventType}” at ${formatDateTime(g.createdAt)} do not add up to zero (they are out by ${formatNaira(Math.abs(sum))}).`,
      );
    }
  }

  // Only groups that actually put money into escrow count as funding; a card
  // payment that landed in the wallet instead has no escrow line.
  const funding = trail.groups.filter(
    (g) =>
      FUNDING_EVENTS.has(g.eventType) &&
      g.lines.some((l) => l.account === "escrow"),
  );
  const settlement = trail.groups.filter((g) => g.eventType === "hire_settled");

  const escrowIn = sumOf(funding, "escrow", -1);
  if (funding.length === 0) {
    if (e.fundedAt !== null) {
      problems.push(
        "This hire is marked paid but has no payment in the ledger.",
      );
    }
  } else {
    if (escrowIn !== e.agreedPriceKobo) {
      problems.push(
        `${formatNaira(escrowIn)} was put into escrow, but the agreed price is ${formatNaira(e.agreedPriceKobo)}.`,
      );
    }
    const feeRecorded = sumOf(funding, "platform_revenue", -1);
    if (e.businessFeeKobo !== null && feeRecorded !== e.businessFeeKobo) {
      problems.push(
        `The business fee recorded as revenue is ${formatNaira(feeRecorded)}, but the hire’s business fee is ${formatNaira(e.businessFeeKobo)}.`,
      );
    }
  }

  if (settlement.length > 0) {
    const escrowOut = sumOf(settlement, "escrow", 1);
    if (escrowOut !== escrowIn) {
      problems.push(
        `${formatNaira(escrowOut)} was taken out of escrow, but ${formatNaira(escrowIn)} was put in.`,
      );
    }

    const creatorCredit = sumOf(settlement, "creator_wallet", -1);
    const creatorFee = sumOf(settlement, "platform_revenue", -1);
    if (
      e.releasedKobo !== null &&
      creatorCredit + creatorFee !== e.releasedKobo
    ) {
      problems.push(
        `The creator’s credit (${formatNaira(creatorCredit)}) and the creator fee (${formatNaira(creatorFee)}) do not make the released amount (${formatNaira(e.releasedKobo)}).`,
      );
    }

    const businessCredit = sumOf(settlement, "business_wallet", -1);
    if (e.refundedKobo !== null && businessCredit !== e.refundedKobo) {
      problems.push(
        `${formatNaira(businessCredit)} was refunded to the business wallet, but the hire records ${formatNaira(e.refundedKobo)}.`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}
