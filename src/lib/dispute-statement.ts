import "server-only";

// What adding a statement to a dispute, and withdrawing one, do after the
// caller has been authenticated: shared by the creator's, the business's and
// the admin's Server Actions (they differ only in who may sign in).

import { refresh } from "next/cache";

import { addDisputeStatement, withdrawDispute } from "@/lib/db/disputes";
import { isUuid, text, type FormState } from "@/lib/form-data";
import {
  isStatementLimited,
  STATEMENT_LIMITED_MESSAGE,
} from "@/lib/money-limits";
import {
  MAX_PROOF_FILES,
  parseOptionalProofLinks,
  parseStatementBody,
} from "@/lib/proof";
import {
  screenshotFiles,
  storeScreenshots,
  TOO_MANY_SCREENSHOTS,
} from "@/lib/proof-upload";
import { refusalText } from "@/lib/refusals";

export type StatementState = FormState<"body" | "links" | "screenshots">;
export type WithdrawDisputeState = FormState<never>;

const SAVE_FAILED =
  "We couldn’t save your pictures just now. Try again in a moment.";

/**
 * Adds a statement for the signed-in person `userId`. Order: validate (text,
 * links, contact details), rate limit, process and save the pictures, then
 * write it. If the database refuses after the pictures were saved they are
 * left for the daily orphan sweep. The database decides whether this person
 * may write on this dispute and whether it is still open.
 */
export async function addStatementFromForm(
  userId: string,
  form: FormData,
): Promise<StatementState> {
  const disputeId = text(form, "disputeId");
  if (!isUuid(disputeId)) {
    return { status: "error", message: refusalText("no_such_dispute") };
  }

  const files = screenshotFiles(form);
  if (files.length > MAX_PROOF_FILES) {
    return { status: "error", errors: { screenshots: TOO_MANY_SCREENSHOTS } };
  }
  const body = parseStatementBody(text(form, "body"));
  const links = parseOptionalProofLinks(text(form, "links"));
  if (!body.ok || !links.ok) {
    return {
      status: "error",
      errors: {
        body: body.ok ? undefined : body.message,
        links: links.ok ? undefined : links.message,
      },
    };
  }
  if (isStatementLimited(userId)) {
    return { status: "error", message: STATEMENT_LIMITED_MESSAGE };
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

  const result = await addDisputeStatement(
    disputeId,
    body.body,
    links.links,
    fileIds,
  );
  // Refresh on a refusal too: the dispute may have closed under them.
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "Your statement was added." };
}

/**
 * The person who opened the dispute withdraws it. The database checks that it
 * is theirs and still open; no money moves.
 */
export async function withdrawDisputeFromForm(
  form: FormData,
): Promise<WithdrawDisputeState> {
  const disputeId = text(form, "disputeId");
  if (!isUuid(disputeId)) {
    return { status: "error", message: refusalText("no_such_dispute") };
  }
  if (form.get("withdrawConfirmed") !== "on") {
    return {
      status: "error",
      message: "Tick the box to confirm you want to withdraw.",
    };
  }
  const result = await withdrawDispute(disputeId);
  refresh();
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason) };
  }
  return { status: "success", message: "You withdrew the dispute." };
}
