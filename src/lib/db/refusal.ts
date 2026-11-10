import { isRefusal, type Refusal } from "@/lib/refusals";

export type Refused = { ok: false; reason: Refusal };

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
  throw new Error(`${action} failed (${error.code})`);
}
