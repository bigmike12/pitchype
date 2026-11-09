"use server";

import { clientIp } from "@/lib/client-ip";
import { isReportReason, MAX_REPORT_NOTE_LENGTH } from "@/lib/creator-profile";
import { reportCreator } from "@/lib/db/reports";
import { text, type FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";

export type ReportState = FormState<"reason" | "note">;

// Anyone can report, signed in or not, so slow down a single noisy source.
const isRateLimited = createRateLimiter({
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
});

export async function reportCreatorAction(
  _previous: ReportState,
  form: FormData,
): Promise<ReportState> {
  const slug = text(form, "slug");
  const reason = text(form, "reason");
  const note = text(form, "note").trim();
  const values = { reason, note };

  if (!isReportReason(reason)) {
    return {
      status: "error",
      errors: { reason: "Choose what’s wrong." },
      values,
    };
  }
  if (note.length > MAX_REPORT_NOTE_LENGTH) {
    return {
      status: "error",
      errors: {
        note: `Use ${MAX_REPORT_NOTE_LENGTH} characters or fewer.`,
      },
      values,
    };
  }
  if (isRateLimited(await clientIp())) {
    return {
      status: "error",
      message:
        "Too many reports from this connection. Wait a few minutes, then try again.",
      values,
    };
  }

  try {
    const outcome = await reportCreator(slug, reason, note || null);
    if (outcome === "not_found") {
      return {
        status: "error",
        message: "This profile is no longer listed.",
        values,
      };
    }
  } catch (error) {
    console.error(
      "report failed",
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
    message: "Thanks. Our team will look at this profile.",
  };
}
