import { isRefusal, type Refusal } from "../refusals.ts";

export type Refused = { ok: false; reason: Refusal };

/** What a database writer returns: the value, or the reason it was refused. */
export type Result<T> = { ok: true; value: T } | Refused;

/**
 * Turns a refusal from a Stage 5 database function (errcode P0001 with a
 * known code as the message, or a 42501 permission error) into a typed
 * result. Anything else is a real failure and throws.
 */
export function refused(
  error: { code?: string; message: string },
  action: string,
): Refused {
  if (error.code === "P0001" && isRefusal(error.message)) {
    return { ok: false, reason: error.message };
  }
  if (error.code === "42501") return { ok: false, reason: "not_allowed" };
  // The one refusal raised as 22023 (invalid argument) rather than P0001:
  // paying or cancelling without ticking the non-refundable-fee notice.
  if (error.code === "22023" && error.message === "fee_notice_required") {
    return { ok: false, reason: "fee_notice_required" };
  }
  throw new Error(`${action} failed (${error.code})`);
}
