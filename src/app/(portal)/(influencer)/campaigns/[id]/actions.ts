"use server";

import { refresh } from "next/cache";

import {
  parseApplicationForm,
  type ApplicationField,
} from "@/lib/applications";
import { requireRole, requireUser } from "@/lib/auth";
import {
  applyToCampaign,
  editApplication,
  withdrawApplication,
} from "@/lib/db/applications";
import {
  getCampaign,
  reportCampaign,
  type CampaignReportReason,
} from "@/lib/db/campaigns";
import { text, type FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";
import { refusalText } from "@/lib/refusals";

export type CampaignReportState = FormState<"reason" | "note">;

const REASONS: CampaignReportReason[] = [
  "scam_or_fraud",
  "off_platform_contact",
  "banned_content",
  "misleading",
  "other",
];

const isRateLimited = createRateLimiter({
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
});

export async function reportCampaignAction(
  _previous: CampaignReportState,
  form: FormData,
): Promise<CampaignReportState> {
  const user = await requireUser();
  const reason = text(form, "reason") as CampaignReportReason;
  const note = text(form, "note").trim();
  const values = { reason, note };

  if (!REASONS.includes(reason)) {
    return {
      status: "error",
      errors: { reason: "Choose what’s wrong." },
      values,
    };
  }
  if (note.length > 500) {
    return {
      status: "error",
      errors: { note: "Use 500 characters or fewer." },
      values,
    };
  }
  if (isRateLimited(user.id)) {
    return {
      status: "error",
      message: "That’s a lot of reports. Wait a few minutes, then try again.",
      values,
    };
  }

  try {
    const outcome = await reportCampaign(
      text(form, "campaignId"),
      reason,
      note || null,
    );
    if (outcome === "not_found") {
      return {
        status: "error",
        message: "This campaign is no longer open.",
        values,
      };
    }
  } catch (error) {
    console.error(
      "campaign report failed",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message: "We couldn’t send your report just now. Please try again.",
      values,
    };
  }
  return {
    status: "success",
    message: "Thanks. Our team will look at this campaign.",
  };
}

// Applying ----------------------------------------------------------------------------

export type ApplyState = FormState<ApplicationField>;

const isApplyLimited = createRateLimiter({
  maxAttempts: 10,
  windowMs: 10 * 60 * 1000,
});

/**
 * Applies, or edits an application when `applicationId` is set. The price
 * is checked against the campaign as the server reads it, never the form;
 * eligibility, places and standing are checked by the database.
 */
export async function applyAction(
  _previous: ApplyState,
  form: FormData,
): Promise<ApplyState> {
  const user = await requireRole("influencer");
  const campaignId = text(form, "campaignId");
  const applicationId = text(form, "applicationId");
  const values = { price: text(form, "price"), note: text(form, "note") };

  if (isApplyLimited(user.id)) {
    return {
      status: "error",
      message: "Too many tries. Wait a few minutes, then try again.",
      values,
    };
  }
  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.priceKobo === null) {
    return { status: "error", message: refusalText("campaign_closed"), values };
  }
  const parsed = parseApplicationForm(form, campaign.priceKobo);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  const result = applicationId
    ? await editApplication(applicationId, parsed.value)
    : await applyToCampaign(campaign.id, parsed.value);
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason), values };
  }
  refresh();
  return {
    status: "success",
    message: applicationId
      ? "Saved. The business sees your new price and note."
      : "Applied. The business can now see your application.",
    values,
  };
}

export async function withdrawAction(form: FormData): Promise<void> {
  await requireRole("influencer");
  await withdrawApplication(text(form, "applicationId"));
  refresh();
}
