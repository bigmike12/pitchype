// Which payment funded a hire. settle_money() takes the Paystack charge for a
// creator-fault refund from the payment_id on the hire's first escrow funding
// line (20261113100250), not from every succeeded payment: a late payment that
// was stranded into the wallet is not part of the hire. The admin preview must
// pick the same payment. No framework imports, so node tests cover it.

type FundingLine = {
  engagementId: string;
  paymentId: string | null;
  createdAt: string;
  id: string;
};

/**
 * Pass the hires' escrow credit lines (account escrow, amount below zero,
 * event payment_received or hire_funded). Returns each hire's funding payment
 * id, null if that line has no payment; a hire with no line isn't in the map.
 */
export function fundingPaymentByHire(
  lines: FundingLine[],
): Map<string, string | null> {
  // Same order as the SQL: order by created_at, id.
  const ordered = [...lines].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const map = new Map<string, string | null>();
  for (const line of ordered) {
    if (!map.has(line.engagementId)) map.set(line.engagementId, line.paymentId);
  }
  return map;
}
