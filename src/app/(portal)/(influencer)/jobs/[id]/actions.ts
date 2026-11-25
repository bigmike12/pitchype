"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { getEngagementDetails } from "@/lib/db/applications";
import { cancelFundedEngagement, startEngagement } from "@/lib/db/money";
import {
  parseMetricsForm,
  parseOptionalDay,
  type EvidenceFormState,
} from "@/lib/checkpoint-form";
import { submitCheckpoint, submitKickoff } from "@/lib/db/checkpoints";
import { recordClickProof } from "@/lib/db/click-proofs";
import { submitWork, withdrawFromEngagement } from "@/lib/db/submissions";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { isSubmitLimited, SUBMIT_LIMITED_MESSAGE } from "@/lib/money-limits";
import { openDisputeFromForm, type DisputeState } from "@/lib/open-dispute";
import {
  MAX_PROOF_FILES,
  parseOptionalProofLinks,
  parseProofLinks,
  parseProofNote,
} from "@/lib/proof";
import {
  screenshotFiles,
  storeScreenshots,
  TOO_MANY_SCREENSHOTS,
} from "@/lib/proof-upload";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type JobActionState = FormState<never>;
export type SubmitState = EvidenceFormState;

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
  // A campaign's final requirements can ask for a report and analytics. They
  // are only sent when typed, so a campaign without any is submitted exactly
  // as before.
  const reportRaw = text(form, "report").trim();
  const metrics = parseMetricsForm(form);
  const capturedOn = parseOptionalDay(text(form, "capturedOn"));
  const hasFinalFields =
    reportRaw !== "" ||
    (metrics.ok && metrics.metrics !== null) ||
    (capturedOn.ok && capturedOn.day !== null);
  // Without the extra fields this is the plain rule: a link or a screenshot.
  const links = hasFinalFields
    ? parseOptionalFinalLinks(text(form, "links"), files.length)
    : parseProofLinks(text(form, "links"), files.length);
  const note = parseProofNote(text(form, "note"));
  if (!links.ok || !note.ok || !metrics.ok || !capturedOn.ok) {
    return {
      status: "error",
      errors: {
        links: links.ok ? undefined : links.message,
        note: note.ok ? undefined : note.message,
        metrics: metrics.ok ? undefined : metrics.message,
        capturedOn: capturedOn.ok ? undefined : "Choose a valid day.",
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
    hasFinalFields
      ? {
          metrics: metrics.metrics,
          capturedOn: capturedOn.day,
          report: reportRaw === "" ? null : reportRaw,
        }
      : undefined,
  );
  // Refresh on a refusal too: the job may have changed under the creator.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  sendEmailsAfterResponse();
  return { status: "success", message: "Your work has been sent in." };
}

/**
 * Links for a final submission: with no links and no screenshots the plain
 * "add a link or a screenshot" message stands only when the campaign asks for
 * nothing else, which the database decides, so an empty list is allowed here
 * when a report or figures come with it.
 */
function parseOptionalFinalLinks(raw: string, fileCount: number) {
  return raw.trim() === "" && fileCount === 0
    ? ({ ok: true, links: [] as string[] } as const)
    : parseProofLinks(raw, fileCount);
}

/**
 * A per-click creator records where they posted their link: links and
 * screenshots for the record, no review. Same order as submitWorkAction:
 * authenticate, validate, rate limit, save the pictures, then record.
 */
export async function recordClickProofAction(
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

  const result = await recordClickProof(
    engagementId,
    note.note,
    links.links,
    fileIds,
  );
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "Saved. The business can see it." };
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

/** What a kickoff or checkpoint action returns: errors per field, or a message. */
const EVIDENCE_SAVED =
  "Saved. The business can see it, and it’s in your job’s trail.";

/**
 * The creator confirms the kickoff. Order: authenticate, validate, rate
 * limit, save the pictures, then record. Nothing here touches the job's
 * status or money; the database checks it's this creator's running job.
 */
export async function submitKickoffAction(
  _previous: EvidenceFormState,
  form: FormData,
): Promise<EvidenceFormState> {
  const user = await requireRole("influencer");
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }
  if (
    form.get("confirmedBrief") !== "on" ||
    form.get("confirmedStarted") !== "on"
  ) {
    return {
      status: "error",
      errors: { confirm: refusalText("kickoff_confirmations_required") },
    };
  }
  const files = screenshotFiles(form);
  if (files.length > 3) {
    return {
      status: "error",
      errors: { screenshots: "Add up to 3 screenshots." },
    };
  }
  const note = parseProofNote(text(form, "note"));
  if (!note.ok || (note.note !== null && note.note.length > 500)) {
    return {
      status: "error",
      errors: { note: "Keep the note to 500 characters or fewer." },
    };
  }
  if (await isSubmitLimited(user.id)) {
    return { status: "error", message: SUBMIT_LIMITED_MESSAGE };
  }
  const stored = await saveEvidenceFiles(user.id, files);
  if (!stored.ok) return stored.state;

  const result = await submitKickoff(engagementId, {
    confirmedBrief: true,
    confirmedStarted: true,
    note: note.note,
    fileIds: stored.fileIds,
  });
  refresh();
  if (!result.ok) {
    return evidenceRefusal(result.reason);
  }
  sendEmailsAfterResponse();
  return { status: "success", message: EVIDENCE_SAVED };
}

/** The creator sends evidence for one progress checkpoint. Same order as the kickoff. */
export async function submitCheckpointAction(
  _previous: EvidenceFormState,
  form: FormData,
): Promise<EvidenceFormState> {
  const user = await requireRole("influencer");
  const hireCheckpointId = text(form, "hireCheckpointId");
  if (!UUID.test(hireCheckpointId)) {
    return { status: "error", message: refusalText("checkpoint_not_yours") };
  }
  const files = screenshotFiles(form);
  if (files.length > MAX_PROOF_FILES) {
    return { status: "error", errors: { screenshots: TOO_MANY_SCREENSHOTS } };
  }
  const links = parseOptionalProofLinks(text(form, "links"));
  const note = parseProofNote(text(form, "note"));
  const metrics = parseMetricsForm(form);
  const capturedOn = parseOptionalDay(text(form, "capturedOn"));
  const periodFrom = parseOptionalDay(text(form, "periodFrom"));
  const periodTo = parseOptionalDay(text(form, "periodTo"));
  if (
    !links.ok ||
    !note.ok ||
    !metrics.ok ||
    !capturedOn.ok ||
    !periodFrom.ok ||
    !periodTo.ok
  ) {
    const invalidDay = "Choose a valid day.";
    return {
      status: "error",
      errors: {
        links: links.ok ? undefined : links.message,
        note: note.ok ? undefined : note.message,
        metrics: metrics.ok ? undefined : metrics.message,
        capturedOn: capturedOn.ok ? undefined : invalidDay,
        periodFrom: periodFrom.ok ? undefined : invalidDay,
        periodTo: periodTo.ok ? undefined : invalidDay,
      },
    };
  }
  if (await isSubmitLimited(user.id)) {
    return { status: "error", message: SUBMIT_LIMITED_MESSAGE };
  }
  const stored = await saveEvidenceFiles(user.id, files);
  if (!stored.ok) return stored.state;

  const result = await submitCheckpoint(hireCheckpointId, {
    note: note.note,
    links: links.links,
    metrics: metrics.metrics,
    capturedOn: capturedOn.day,
    periodFrom: periodFrom.day,
    periodTo: periodTo.day,
    fileIds: stored.fileIds,
  });
  refresh();
  if (!result.ok) {
    return evidenceRefusal(result.reason);
  }
  sendEmailsAfterResponse();
  return { status: "success", message: EVIDENCE_SAVED };
}

/** Saves the screenshots; a failure is worded for the form, and nothing else runs. */
async function saveEvidenceFiles(
  userId: string,
  files: File[],
): Promise<
  { ok: true; fileIds: string[] } | { ok: false; state: EvidenceFormState }
> {
  if (files.length === 0) return { ok: true, fileIds: [] };
  try {
    const stored = await storeScreenshots(userId, files);
    if (!stored.ok) {
      return {
        ok: false,
        state: { status: "error", errors: { screenshots: stored.message } },
      };
    }
    return { ok: true, fileIds: stored.fileIds };
  } catch (error) {
    console.error("proof upload failed", error);
    return { ok: false, state: { status: "error", message: SAVE_FAILED } };
  }
}

function evidenceRefusal(
  reason: Parameters<typeof refusalText>[0],
): EvidenceFormState {
  return reason === "kickoff_confirmations_required"
    ? { status: "error", errors: { confirm: refusalText(reason) } }
    : { status: "error", message: refusalText(reason) };
}
