"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { resolveCampaignReport, transitionCampaign } from "@/lib/db/campaigns";
import { setPhotoVersion } from "@/lib/db/creators";
import {
  clearCover,
  getCreatorImages,
  getSampleImage,
  hideSample,
  resolveReport,
  setCreatorHidden,
} from "@/lib/db/reports";
import { reviewVerification } from "@/lib/db/verification";
import { sendEmailsAfterResponse } from "@/lib/email-after";
import { text, type FormState } from "@/lib/form-data";
import { answerAppeal, liftSuspension, voidStrike } from "@/lib/db/moderation";
import { refusalText } from "@/lib/refusals";
import {
  deleteCover,
  deleteProfilePhoto,
  deleteSampleImage,
} from "@/lib/storage";

// Each action checks the admin role itself; the database functions check it
// again (they refuse anyone else).

const UUID = /^[0-9a-f-]{36}$/;

export type ReviewState = FormState<"followerCount">;

export async function reviewVerificationAction(
  _previous: ReviewState,
  form: FormData,
): Promise<ReviewState> {
  await requireRole("admin");
  const requestId = text(form, "requestId");
  const decision = text(form, "decision");
  if (!UUID.test(requestId))
    return { status: "error", message: "Unknown request." };

  let outcome: "done" | "not_waiting";
  if (decision === "verify") {
    const raw = text(form, "followerCount").replace(/[,\s]/g, "");
    const followerCount = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(followerCount) ||
      followerCount > 2_000_000_000
    ) {
      return {
        status: "error",
        errors: {
          followerCount: "Enter the follower count you saw, e.g. 12400.",
        },
        values: { followerCount: text(form, "followerCount") },
      };
    }
    outcome = await reviewVerification(requestId, {
      approve: true,
      followerCount,
    });
  } else {
    outcome = await reviewVerification(requestId, { approve: false });
  }

  if (outcome === "not_waiting") {
    return {
      status: "error",
      message:
        "This request isn’t waiting any more (already reviewed, or the creator changed the handle).",
    };
  }
  sendEmailsAfterResponse();
  refresh();
  return { status: "success" };
}

export async function resolveReportAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const reportId = text(form, "reportId");
  if (!UUID.test(reportId)) return;
  await resolveReport(reportId);
  refresh();
}

/** Takes the photo down and closes the report. */
export async function removeReportedPhotoAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const reportId = text(form, "reportId");
  const creatorId = text(form, "creatorId");
  if (!UUID.test(reportId) || !UUID.test(creatorId)) return;

  const images = await getCreatorImages(creatorId);
  if (images && images.photoVersion !== null) {
    await setPhotoVersion(creatorId, null);
    await deleteProfilePhoto(images.mediaKey, images.photoVersion);
  }
  await resolveReport(reportId);
  refresh();
}

/** A reason as typed: spaces tidied, or null when it isn't 2 to 200 characters. */
function takedownReason(form: FormData): string | null {
  const reason = text(form, "reason").trim().replace(/\s+/g, " ");
  return reason.length >= 2 && reason.length <= 200 ? reason : null;
}

/**
 * Takes one work sample off the creator's page, with a reason they see, and
 * deletes its file so the picture's address stops working too. The report
 * stays open: there may be more to look at.
 */
export async function hideReportedSampleAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const sampleId = text(form, "sampleId");
  const reason = takedownReason(form);
  if (!UUID.test(sampleId) || !reason) return;

  const sample = await getSampleImage(sampleId);
  if (!sample) return;
  await hideSample(sampleId, reason);
  if (sample.imageVersion !== null) {
    await deleteSampleImage(sample.mediaKey, sampleId, sample.imageVersion);
  }
  refresh();
}

/**
 * Removes the creator's cover and deletes its file. The creator is told, with
 * the reason (clear_cover sends the notice).
 */
export async function removeReportedCoverAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const creatorId = text(form, "creatorId");
  const reason = takedownReason(form);
  if (!UUID.test(creatorId) || !reason) return;

  const images = await getCreatorImages(creatorId);
  const removed = await clearCover(creatorId, reason);
  if (removed !== null && images) await deleteCover(images.mediaKey, removed);
  refresh();
}

/** Hides the profile from the directory and closes the report. */
export async function hideReportedCreatorAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const reportId = text(form, "reportId");
  const creatorId = text(form, "creatorId");
  const reason = text(form, "reason").trim().replace(/\s+/g, " ");
  if (
    !UUID.test(reportId) ||
    !UUID.test(creatorId) ||
    reason.length < 2 ||
    reason.length > 200
  ) {
    return;
  }
  await setCreatorHidden(creatorId, reason);
  sendEmailsAfterResponse();
  await resolveReport(reportId);
  refresh();
}

export async function unhideCreatorAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const creatorId = text(form, "creatorId");
  if (!UUID.test(creatorId)) return;
  await setCreatorHidden(creatorId, null);
  sendEmailsAfterResponse();
  refresh();
}

// Campaigns ----------------------------------------------------------------------------

export async function approveCampaignAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const campaignId = text(form, "campaignId");
  if (!UUID.test(campaignId)) return;
  // "stale" (someone else got there first) needs nothing more than a refresh.
  const result = await transitionCampaign(campaignId, "approve");
  if (result.ok) sendEmailsAfterResponse();
  refresh();
}

export async function sendBackCampaignAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const campaignId = text(form, "campaignId");
  const note = text(form, "note").trim().replace(/\s+/g, " ");
  if (!UUID.test(campaignId) || note.length < 2 || note.length > 500) return;
  const result = await transitionCampaign(campaignId, "reject", note);
  if (result.ok) sendEmailsAfterResponse();
  refresh();
}

export async function resolveCampaignReportAction(
  form: FormData,
): Promise<void> {
  await requireRole("admin");
  const reportId = text(form, "reportId");
  if (!UUID.test(reportId)) return;
  await resolveCampaignReport(reportId);
  refresh();
}

/** Takes the campaign down (the business sees the reason) and closes the report. */
export async function takeDownCampaignAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const reportId = text(form, "reportId");
  const campaignId = text(form, "campaignId");
  const reason = text(form, "reason").trim().replace(/\s+/g, " ");
  if (
    !UUID.test(reportId) ||
    !UUID.test(campaignId) ||
    reason.length < 2 ||
    reason.length > 200
  ) {
    return;
  }
  const result = await transitionCampaign(campaignId, "take_down", reason);
  if (result.ok) sendEmailsAfterResponse();
  await resolveCampaignReport(reportId);
  refresh();
}

// Account standing -----------------------------------------------------------------------
// Every decision needs a written reason; the database refuses one without.

export type StandingDecisionState = FormState<"reason">;

export async function standingDecisionAction(
  _previous: StandingDecisionState,
  form: FormData,
): Promise<StandingDecisionState> {
  await requireRole("admin");
  const decision = text(form, "decision");
  const target = text(form, "target");
  const reason = text(form, "reason").trim();
  const values = { reason };
  if (!UUID.test(target)) {
    return { status: "error", message: "Something went wrong.", values };
  }
  const limit = decision === "answer" || decision === "decline" ? 1000 : 200;
  if (reason.length < 2 || reason.length > limit) {
    return {
      status: "error",
      errors: {
        reason: `Write 2 to ${limit.toLocaleString("en-NG")} characters.`,
      },
      values,
    };
  }

  const result =
    decision === "void"
      ? await voidStrike(target, reason)
      : decision === "lift"
        ? await liftSuspension(target, reason)
        : decision === "answer" || decision === "decline"
          ? await answerAppeal(target, reason, decision === "decline")
          : null;
  if (!result) return { status: "error", message: "Unknown decision.", values };
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason), values };
  }
  sendEmailsAfterResponse();
  refresh();
  return { status: "success", message: "Done." };
}
