// The public contact form (/contact): what it accepts and the email it sends
// to the team inbox. Nothing is stored; the reply happens by email.
// No framework imports, so Node's test runner can load it.

import { isUuid, text, type FieldErrors, type Parsed } from "./form-data.ts";

export const CONTACT_TOPICS = [
  { value: "question", label: "A question" },
  { value: "account", label: "Help with my account" },
  { value: "partnership", label: "Partnerships or press" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];
export type ContactField = "name" | "email" | "topic" | "message";

export type ContactMessage = {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  /** Set once per page view, so a double-click sends one email. */
  formId: string;
};

export const CONTACT_LIMITS = {
  nameMax: 80,
  messageMin: 10,
  messageMax: 2000,
} as const;

// Deliberately loose, like sign-up: the reply is the real proof it works.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// A field people never see. Bots that fill every input fill this too.
export const HONEYPOT_FIELD = "company_website";

export function honeypotFilled(form: FormData): boolean {
  return text(form, HONEYPOT_FIELD).trim() !== "";
}

function topicOf(value: string): ContactTopic | null {
  return CONTACT_TOPICS.find((topic) => topic.value === value)?.value ?? null;
}

export function parseContactForm(
  form: FormData,
): Parsed<ContactMessage, ContactField> {
  const name = text(form, "name").trim();
  const email = text(form, "email").trim();
  const topicValue = text(form, "topic");
  const message = text(form, "message").trim();
  const formIdValue = text(form, "form_id");

  const errors: FieldErrors<ContactField> = {};
  if (name === "") errors.name = "Enter your name.";
  else if (name.length > CONTACT_LIMITS.nameMax) {
    errors.name = `Keep your name to ${CONTACT_LIMITS.nameMax} characters.`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter an email address we can reply to.";
  }
  const topic = topicOf(topicValue);
  if (topic === null) errors.topic = "Choose what it’s about.";
  if (message.length < CONTACT_LIMITS.messageMin) {
    errors.message = `Write at least ${CONTACT_LIMITS.messageMin} characters.`;
  } else if (message.length > CONTACT_LIMITS.messageMax) {
    errors.message = `Keep your message to ${CONTACT_LIMITS.messageMax.toLocaleString("en-NG")} characters.`;
  }

  if (topic === null || Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: { name, email, topic: topicValue, message },
    };
  }
  return {
    ok: true,
    value: {
      name,
      email,
      topic,
      message,
      formId: isUuid(formIdValue) ? formIdValue : crypto.randomUUID(),
    },
  };
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A plain email to the team inbox. Replying goes to the sender (reply-to). */
export function contactEmail(message: ContactMessage): {
  subject: string;
  text: string;
  html: string;
} {
  const label =
    CONTACT_TOPICS.find((topic) => topic.value === message.topic)?.label ??
    message.topic;
  const subject = `Contact: ${label} from ${message.name}`.replace(/\s+/g, " ");
  const text = [
    `From: ${message.name} <${message.email}>`,
    `About: ${label}`,
    "",
    message.message,
    "",
    "Reply to this email to answer them.",
  ].join("\n");
  const html = [
    `<p><strong>From:</strong> ${escapeHtml(message.name)} &lt;${escapeHtml(message.email)}&gt;<br>`,
    `<strong>About:</strong> ${escapeHtml(label)}</p>`,
    `<p style="white-space: pre-wrap">${escapeHtml(message.message)}</p>`,
    `<p style="color: #63636b">Reply to this email to answer them.</p>`,
  ].join("\n");
  return { subject, text, html };
}
