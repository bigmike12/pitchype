"use server";

import { clientIp } from "@/lib/client-ip";
import {
  contactEmail,
  honeypotFilled,
  parseContactForm,
  type ContactField,
} from "@/lib/contact";
import type { FormState } from "@/lib/form-data";
import { createRateLimiter } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/resend";
import { CONTACT_EMAIL } from "@/lib/site";

export type ContactState = FormState<ContactField>;

// The one form anyone can send without an account, so it has the tightest
// limit of the public forms.
const isRateLimited = createRateLimiter({
  name: "contact-form",
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
});

export async function sendContactMessage(
  _previous: ContactState,
  form: FormData,
): Promise<ContactState> {
  // A bot filled the hidden field: look like it worked, send nothing.
  if (honeypotFilled(form)) {
    return { status: "success", message: "Thanks. We’ll reply by email." };
  }

  const parsed = parseContactForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  const message = parsed.value;
  const values = {
    name: message.name,
    email: message.email,
    topic: message.topic,
    message: message.message,
  };
  if (await isRateLimited(await clientIp())) {
    return {
      status: "error",
      message: `You’ve sent a few messages already. Try again in an hour, or email us at ${CONTACT_EMAIL}.`,
      values,
    };
  }

  try {
    await sendEmail({
      to: CONTACT_EMAIL,
      replyTo: message.email,
      idempotencyKey: `contact:${message.formId}`,
      ...contactEmail(message),
    });
  } catch (error) {
    // The message is already free of the key and any address (lib/resend.ts).
    console.error(
      "contact: send failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error",
      message: `We couldn’t send that just now. Try again, or email us at ${CONTACT_EMAIL}.`,
      values,
    };
  }

  return {
    status: "success",
    message: `Thanks. We’ll reply to ${message.email}.`,
    values,
  };
}
