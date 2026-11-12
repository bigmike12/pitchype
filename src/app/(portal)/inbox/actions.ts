"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, requireUser } from "@/lib/auth";
import { sendMessage, startConversation } from "@/lib/db/chat";
import { text, type FormState } from "@/lib/form-data";
import { flagMessage } from "@/lib/moderation";
import { createRateLimiter } from "@/lib/rate-limit";
import { refusalText } from "@/lib/refusals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_MESSAGE_LENGTH = 2000;

const isMessageLimited = createRateLimiter({
  maxAttempts: 20,
  windowMs: 60 * 1000,
});

export type SendState = FormState<"body"> & {
  /** The message held contact details and wasn't sent (a strike). */
  flagged?: boolean;
};

/**
 * Sends a message. The database checks the thread, standing, blocks and
 * contact details; a flagged message comes back as a strike with the text
 * kept in the box so the sender can fix it.
 */
export async function sendMessageAction(
  _previous: SendState,
  form: FormData,
): Promise<SendState> {
  const user = await requireUser();
  const conversationId = text(form, "conversationId");
  const dedupe = text(form, "dedupe");
  const body = text(form, "body").trim();
  const values = { body };

  if (!UUID.test(conversationId) || !UUID.test(dedupe)) {
    return { status: "error", message: refusalText("not_allowed"), values };
  }
  if (body.length === 0 || body.length > MAX_MESSAGE_LENGTH) {
    return {
      status: "error",
      errors: { body: refusalText("message_length") },
      values,
    };
  }
  if (isMessageLimited(user.id)) {
    return {
      status: "error",
      message: "You’re sending messages very fast. Wait a moment.",
      values,
    };
  }

  const result = await sendMessage(conversationId, body, dedupe);
  if (!result.ok) {
    return { status: "error", message: refusalText(result.reason), values };
  }
  if (!result.value.delivered) {
    return {
      status: "error",
      flagged: true,
      message: flagMessage(result.value.flag, result.value.strikes),
      values,
    };
  }
  refresh();
  return { status: "success" };
}

/**
 * A business opens its thread with a creator (from an application or the
 * creator's profile) and goes to it.
 */
export async function startConversationAction(form: FormData): Promise<void> {
  await requireRole("business");
  const creatorId = text(form, "creatorId");
  const applicationId = text(form, "applicationId");
  if (!UUID.test(creatorId) || (applicationId && !UUID.test(applicationId))) {
    redirect("/inbox?notice=not_allowed");
  }
  const result = await startConversation(creatorId, applicationId || null);
  if (!result.ok) redirect(`/inbox?notice=${result.reason}`);
  redirect(`/inbox/${result.value}`);
}
