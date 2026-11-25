"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  allowIdentityRetry,
  reviewIdentityCheck,
  reviewScreening,
} from "@/lib/db/identity";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { isUuid, text, type FormState } from "@/lib/form-data";
import { refusalText } from "@/lib/refusals";

// Every action here: sign-in and the admin role first, then the inputs, then
// the database function (which checks the admin role again, needs the written
// reason and records who decided and when). The reason and the confirmation
// are required here, not only in the form.

export type DecisionState = FormState<"reason">;

const REASON_MIN = 3;
const REASON_MAX = 500;

/** The shared checks: a reason of 3 to 500 characters and the confirm box. */
function readDecision(
  form: FormData,
): { ok: true; reason: string } | { ok: false; state: DecisionState } {
  const reason = text(form, "reason").trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return {
      ok: false,
      state: {
        status: "error",
        errors: { reason: refusalText("identity_reason_required") },
        values: { reason },
      },
    };
  }
  if (form.get("confirm") !== "on") {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Tick the box to confirm you’ve checked the details.",
        values: { reason },
      },
    };
  }
  return { ok: true, reason };
}

const BAD_REQUEST: DecisionState = {
  status: "error",
  message: "Something was missing from that request. Refresh and try again.",
};

/** Approves or rejects a check held for review (a duplicate ID or RC/BN number). */
export async function reviewCheckAction(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await requireRole("admin");
  const checkId = text(form, "checkId");
  const outcome = text(form, "outcome");
  if (!isUuid(checkId) || (outcome !== "verified" && outcome !== "failed")) {
    return BAD_REQUEST;
  }
  const decision = readDecision(form);
  if (!decision.ok) return decision.state;

  const result = await reviewIdentityCheck(checkId, outcome, decision.reason);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { reason: decision.reason },
    };
  }
  sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "Decided." };
}

/** Clears or confirms a possible sanctions/PEP match. */
export async function reviewScreeningAction(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await requireRole("admin");
  const screeningId = text(form, "screeningId");
  const outcome = text(form, "outcome");
  if (
    !isUuid(screeningId) ||
    (outcome !== "cleared" && outcome !== "confirmed")
  ) {
    return BAD_REQUEST;
  }
  const decision = readDecision(form);
  if (!decision.ok) return decision.state;

  const result = await reviewScreening(screeningId, outcome, decision.reason);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { reason: decision.reason },
    };
  }
  refresh();
  return { status: "success", message: "Decided." };
}

/** Lets someone who used their tries start a check again. */
export async function allowRetryAction(
  _previous: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await requireRole("admin");
  const userId = text(form, "userId");
  if (!isUuid(userId)) return BAD_REQUEST;
  const decision = readDecision(form);
  if (!decision.ok) return decision.state;

  const result = await allowIdentityRetry(userId, decision.reason);
  if (!result.ok) {
    return {
      status: "error",
      message: refusalText(result.reason),
      values: { reason: decision.reason },
    };
  }
  refresh();
  return { status: "success", message: "They can try again." };
}
