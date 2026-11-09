"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { resolveCampaignReport, transitionCampaign } from "@/lib/db/campaigns";
import { setPhotoVersion } from "@/lib/db/creators";
import {
  getCreatorPhotoVersion,
  resolveReport,
  setCreatorHidden,
} from "@/lib/db/reports";
import { reviewVerification } from "@/lib/db/verification";
import { text, type FormState } from "@/lib/form-data";
import { deleteProfilePhoto } from "@/lib/storage";

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

  const version = await getCreatorPhotoVersion(creatorId);
  if (version !== null) {
    await setPhotoVersion(creatorId, null);
    await deleteProfilePhoto(creatorId, version);
  }
  await resolveReport(reportId);
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
  await resolveReport(reportId);
  refresh();
}

export async function unhideCreatorAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const creatorId = text(form, "creatorId");
  if (!UUID.test(creatorId)) return;
  await setCreatorHidden(creatorId, null);
  refresh();
}

// Campaigns ----------------------------------------------------------------------------

export async function approveCampaignAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const campaignId = text(form, "campaignId");
  if (!UUID.test(campaignId)) return;
  // "stale" (someone else got there first) needs nothing more than a refresh.
  await transitionCampaign(campaignId, "approve");
  refresh();
}

export async function sendBackCampaignAction(form: FormData): Promise<void> {
  await requireRole("admin");
  const campaignId = text(form, "campaignId");
  const note = text(form, "note").trim().replace(/\s+/g, " ");
  if (!UUID.test(campaignId) || note.length < 2 || note.length > 500) return;
  await transitionCampaign(campaignId, "reject", note);
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
  await transitionCampaign(campaignId, "take_down", reason);
  await resolveCampaignReport(reportId);
  refresh();
}
