"use server";

import { requireUser } from "@/lib/auth";
import { reportCampaign, type CampaignReportReason } from "@/lib/db/campaigns";
import { text, type FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";

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
