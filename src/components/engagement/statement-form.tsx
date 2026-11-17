"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  formDataWithShrunkScreenshots,
  ProofFields,
} from "@/components/engagement/proof-fields";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { MAX_STATEMENT_LENGTH } from "@/lib/proof";

import type { StatementState } from "@/lib/dispute-statement";

/**
 * Adds a statement to an open dispute: words, and links or screenshots if
 * they help. The page passes the Server Action for whoever is signed in.
 */
export function StatementForm({
  disputeId,
  action,
  placeholder,
}: {
  disputeId: string;
  action: (previous: StatementState, form: FormData) => Promise<StatementState>;
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState<StatementState, FormData>(
    action,
    { status: "idle" },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [preparing, setPreparing] = useState(false);
  // Pictures too big to send in one request: caught here, before any upload.
  const [pictureError, setPictureError] = useState<string>();

  // The statement is on the page now: empty the form for the next one.
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPictureError(undefined);
    setPreparing(true);
    const prepared = await formDataWithShrunkScreenshots(form);
    setPreparing(false);
    if (!prepared.ok) {
      setPictureError(prepared.message);
      return;
    }
    startTransition(() => formAction(prepared.data));
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={send}
      className="max-w-xl space-y-5"
    >
      <input type="hidden" name="disputeId" value={disputeId} />
      <TextAreaField
        id="statement-body"
        name="body"
        label="Add a statement"
        required
        rows={4}
        maxLength={MAX_STATEMENT_LENGTH}
        placeholder={placeholder}
        hint={`Up to ${MAX_STATEMENT_LENGTH.toLocaleString("en-NG")} characters. Phone numbers, emails and chat links aren’t allowed here.`}
        error={state.errors?.body}
      />
      <ProofFields
        idPrefix="statement"
        linksOptional
        onScreenshotsChange={() => setPictureError(undefined)}
        errors={{
          ...state.errors,
          screenshots: pictureError ?? state.errors?.screenshots,
        }}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={pending || preparing}>
        {preparing ? "Preparing…" : pending ? "Adding…" : "Add statement"}
      </Button>
    </form>
  );
}
