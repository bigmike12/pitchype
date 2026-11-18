import "server-only";

// What opening a dispute does after the caller has been authenticated: shared
// by the creator's and the business's Server Actions (the only differences
// are who is signed in and which copy the form shows).

import { refresh } from "next/cache";

import { openDispute } from "@/lib/db/disputes";
import { text, type FormState } from "@/lib/form-data";
import {
  DISPUTE_OPEN_LIMITED_MESSAGE,
  isDisputeOpenLimited,
} from "@/lib/money-limits";
import {
  MAX_PROOF_FILES,
  parseDisputeReason,
  parseOptionalProofLinks,
} from "@/lib/proof";
import {
  screenshotFiles,
  storeScreenshots,
  TOO_MANY_SCREENSHOTS,
} from "@/lib/proof-upload";
import { refusalText } from "@/lib/refusals";

export type DisputeState = FormState<"reason" | "links" | "screenshots">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SAVE_FAILED =
  "We couldn’t save your pictures just now. Try again in a moment.";

/**
 * Opens a dispute for the signed-in person `userId`. The reason is required;
 * links and pictures are optional. Order: validate, rate limit, process and
 * save the pictures, then open it. If the database refuses after the pictures
 * were saved they are left for the daily orphan sweep. The database decides
 * whether this person may dispute this hire.
 */
export async function openDisputeFromForm(
  userId: string,
  form: FormData,
): Promise<DisputeState> {
  const engagementId = text(form, "engagementId");
  if (!UUID.test(engagementId)) {
    return { status: "error", message: refusalText("no_such_engagement") };
  }

  const files = screenshotFiles(form);
  if (files.length > MAX_PROOF_FILES) {
    return { status: "error", errors: { screenshots: TOO_MANY_SCREENSHOTS } };
  }
  const reason = parseDisputeReason(text(form, "reason"));
  const links = parseOptionalProofLinks(text(form, "links"));
  if (!reason.ok || !links.ok) {
    return {
      status: "error",
      errors: {
        reason: reason.ok ? undefined : reason.message,
        links: links.ok ? undefined : links.message,
      },
    };
  }
  if (await isDisputeOpenLimited(userId)) {
    return { status: "error", message: DISPUTE_OPEN_LIMITED_MESSAGE };
  }

  let fileIds: string[] = [];
  if (files.length > 0) {
    try {
      const stored = await storeScreenshots(userId, files);
      if (!stored.ok) {
        return { status: "error", errors: { screenshots: stored.message } };
      }
      fileIds = stored.fileIds;
    } catch (error) {
      console.error("proof upload failed", error);
      return { status: "error", message: SAVE_FAILED };
    }
  }

  const result = await openDispute(
    engagementId,
    reason.reason,
    links.links,
    fileIds,
  );
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "Your dispute is open." };
}
