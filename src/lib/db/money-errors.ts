// Kept apart from db/money.ts, which needs the Supabase clients, so that
// node tests and src/lib/payments.ts can check for it without loading them.

/**
 * A money function found a state that should never happen (record_card_payment's
 * payment_total_wrong, payment_not_succeeded, invalid_paystack_fee,
 * invalid_paid_amount). Nothing was written; a person has to look. `code` is the database's code, safe to log.
 */
export class MoneyStateError extends Error {
  code: string;

  constructor(code: string) {
    super(`money state needs review (${code})`);
    this.name = "MoneyStateError";
    this.code = code;
  }
}
