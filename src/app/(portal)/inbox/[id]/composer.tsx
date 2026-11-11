"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FieldMessages } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { sendMessageAction, type SendState } from "../actions";

/**
 * The message box. Each send carries a fresh key, so a double submit or a
 * retry is stored (or counted as a strike) once.
 */
export function Composer({ conversationId }: { conversationId: string }) {
  const [state, formAction, pending] = useActionState<SendState, FormData>(
    sendMessageAction,
    { status: "idle" },
  );
  const dedupe = useRef<string | null>(null);

  function send(form: FormData) {
    dedupe.current ??= crypto.randomUUID();
    form.set("dedupe", dedupe.current);
    formAction(form);
    // The next send is a new message, whatever happens to this one.
    dedupe.current = null;
  }

  return (
    <form action={send} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.flagged && (
        <Callout
          tone="danger"
          icon={ShieldAlert}
          title="Not sent"
          action={
            <Link href="/account/standing" className="link">
              Your account standing
            </Link>
          }
        >
          {state.message}
        </Callout>
      )}
      <label htmlFor="body" className="sr-only">
        Message
      </label>
      <textarea
        id="body"
        name="body"
        rows={3}
        maxLength={2000}
        required
        defaultValue={state.values?.body}
        aria-invalid={state.errors?.body ? true : undefined}
        aria-describedby={state.errors?.body ? "body-error" : undefined}
        placeholder="Write a message"
        className="block w-full rounded-control border border-field bg-white px-4 py-3 text-base text-ink focus-visible:border-ink"
      />
      <FieldMessages id="body" error={state.errors?.body} />
      {!state.flagged && (
        <FormMessage
          status={state.status === "success" ? "idle" : state.status}
          message={state.message}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Keep phone numbers, emails and other apps out: payments are only
          protected on Pitchype.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
