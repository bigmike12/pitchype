"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { getEngagementDetails } from "@/lib/db/applications";
import { cancelFundedEngagement, startEngagement } from "@/lib/db/money";
import { submitWork, withdrawFromEngagement } from "@/lib/db/submissions";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { isSubmitLimited, SUBMIT_LIMITED_MESSAGE } from "@/lib/money-limits";
import { openDisputeFromForm, type DisputeState } from "@/lib/open-dispute";
import { MAX_PROOF_FILES, parseProofLinks, parseProofNote } from "@/lib/proof";
import {
  screenshotFiles,
  storeScreenshots,
  TOO_MANY_SCREENSHOTS,
} from "@/lib/proof-upload";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type JobActionState = FormState<never>;
export type SubmitState = FormState<"links" | "note" | "screenshots">;

const SAVE_FAILED =
  "We couldn’t save your pictures just now. Try again in a moment.";

/**
 * The creator starts work on a paid job. After this they can't cancel on
 * their own (CLAUDE.md §5, §6.2), so the tick box is checked here as well as
 * in the browser. The database checks it's this creator's job and `funded`.
 */
export async function startWorkAction(
  _previous: JobActionState,
  form: FormData,
): Promise<JobActionState> {
  await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("startConfirmed") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm you want to start.",
    };
  }
  const result = await startEngagement(engagementId);
  // Refresh on a refusal too: the job may have changed under the creator.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "Work has started." };
}

/**
 * The creator withdraws from a paid job. Before starting, the database takes
 * the creator-at-fault refund path of `cancel_funded_engagement`; after
 * starting (working or sent back) it is `withdraw_from_engagement`, which
 * settles the same way: the business gets its money back and the creator
 * isn't paid. Nothing here decides the money; this only picks the function
 * the job's status calls for.
 */
export async function withdrawAction(
  _previous: JobActionState,
  form: FormData,
): Promise<JobActionState> {
  const user = await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (form.get("withdrawConfirmed") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm you want to withdraw.",
    };
  }
  const engagement = await getEngagementDetails(engagementId);
  if (!engagement || engagement.creator.id !== user.id) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  // The database checks the status again under its locks; this only chooses
  // the path.
  const result =
    engagement.status === "funded"
      ? // The fee-notice flag only applies to business callers; a creator's
        // call takes the withdraw path whatever it is.
        await cancelFundedEngagement(engagementId, true)
      : engagement.status === "in_progress" || engagement.status === "denied"
        ? await withdrawFromEngagement(engagementId)
        : ({ ok: false, reason: "engagement_locked" } as const);
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "You’ve withdrawn from this job." };
}

/**
 * The creator sends in proof of work (the first time or after a denial; the
 * database decides which rounds are open). Order: authenticate, validate,
 * rate limit, then process and save the pictures, then submit. If the
 * database refuses after the pictures were saved they are left for the daily
 * orphan sweep.
 */
export async function submitWorkAction(
  _previous: SubmitState,
  form: FormData,
): Promise<SubmitState> {
  const user = await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }

  const files = screenshotFiles(form);
  if (files.length > MAX_PROOF_FILES) {
    return { status: "error", errors: { screenshots: TOO_MANY_SCREENSHOTS } };
  }
  const links = parseProofLinks(text(form, "links"), files.length);
  const note = parseProofNote(text(form, "note"));
  if (!links.ok || !note.ok) {
    return {
      status: "error",
      errors: {
        links: links.ok ? undefined : links.message,
        note: note.ok ? undefined : note.message,
      },
    };
  }
  if (await isSubmitLimited(user.id)) {
    return { status: "error", message: SUBMIT_LIMITED_MESSAGE };
  }

  let fileIds: string[] = [];
  if (files.length > 0) {
    try {
      const stored = await storeScreenshots(user.id, files);
      if (!stored.ok) {
        return { status: "error", errors: { screenshots: stored.message } };
      }
      fileIds = stored.fileIds;
    } catch (error) {
      console.error("proof upload failed", error);
      return { status: "error", message: SAVE_FAILED };
    }
  }

  const result = await submitWork(
    engagementId,
    note.note,
    links.links,
    fileIds,
  );
  // Refresh on a refusal too: the job may have changed under the creator.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "Your work has been sent in." };
}

/** The creator opens a dispute on work the business sent back. */
export async function openDisputeAction(
  _previous: DisputeState,
  form: FormData,
): Promise<DisputeState> {
  const user = await requireRole("influencer");
  const state = await openDisputeFromForm(user.id, form);
  if (state.status === "success") sendEmailsAfterResponse();
  return state;
}
