"use client";

import { Mail, MailCheck, UserRound } from "lucide-react";
import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Notice } from "@/components/ui/notice";
import { CONTACT_LIMITS, CONTACT_TOPICS, HONEYPOT_FIELD } from "@/lib/contact";

import { sendContactMessage, type ContactState } from "./actions";

export function ContactForm() {
  // One id per page view, so a double-click sends one email (it's Resend's
  // idempotency key). Kept in a ref and added when sending, so the page
  // itself stays static. After a failed send it's dropped: a retry may have
  // different words, and Resend refuses a reused key with a new message.
  const formId = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    async (previous, form) => {
      formId.current ??= crypto.randomUUID();
      form.set("form_id", formId.current);
      const next = await sendContactMessage(previous, form);
      if (next.status === "error" && next.message) formId.current = null;
      return next;
    },
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <Notice icon={MailCheck} title="Message sent">
        <p>{state.message}</p>
      </Notice>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Hidden from people; bots that fill every field fill this one. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] size-px overflow-hidden"
      >
        <label htmlFor={HONEYPOT_FIELD}>Leave this empty</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Your name"
          name="name"
          icon={UserRound}
          autoComplete="name"
          required
          maxLength={CONTACT_LIMITS.nameMax}
          defaultValue={state.values?.name}
          error={state.errors?.name}
        />
        <TextField
          label="Email address"
          name="email"
          type="email"
          icon={Mail}
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.values?.email}
          error={state.errors?.email}
        />
      </div>
      <SelectField
        label="What it’s about"
        name="topic"
        placeholder="Choose one"
        options={CONTACT_TOPICS.map((topic) => ({ ...topic }))}
        required
        defaultValue={state.values?.topic ?? ""}
        error={state.errors?.topic}
      />
      <TextAreaField
        label="Your message"
        name="message"
        rows={6}
        required
        minLength={CONTACT_LIMITS.messageMin}
        maxLength={CONTACT_LIMITS.messageMax}
        defaultValue={state.values?.message}
        error={state.errors?.message}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
