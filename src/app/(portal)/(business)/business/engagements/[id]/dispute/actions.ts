"use server";

import { requireRole } from "@/lib/auth";
import {
  addStatementFromForm,
  withdrawDisputeFromForm,
  type StatementState,
  type WithdrawDisputeState,
} from "@/lib/dispute-statement";
import { sendEmailsAfterResponse } from "@/lib/email-after";

// Sign-in and the business role first, then the shared body (validate, rate
// limit, store, write). The database checks that the person is on this
// dispute, that it is still open, and that only the opener withdraws.

export async function addStatementAction(
  _previous: StatementState,
  form: FormData,
): Promise<StatementState> {
  const user = await requireRole("business");
  const state = await addStatementFromForm(user.id, form);
  if (state.status === "success") sendEmailsAfterResponse();
  return state;
}

export async function withdrawDisputeAction(
  _previous: WithdrawDisputeState,
  form: FormData,
): Promise<WithdrawDisputeState> {
  await requireRole("business");
  const state = await withdrawDisputeFromForm(form);
  if (state.status === "success") sendEmailsAfterResponse();
  return state;
}
