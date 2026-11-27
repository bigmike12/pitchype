"use client";

import { useActionState } from "react";

import { FeedbackStatusPill } from "@/components/feedback/feedback-status-pill";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { formatDate } from "@/lib/creator-profile";
import type { AdminFeedbackRequest } from "@/lib/db/feedback";
import { FEEDBACK_LIMITS, FEEDBACK_STATUSES, kindLabel } from "@/lib/feedback";

import {
  markFeedbackDuplicateAction,
  setFeedbackStatusAction,
  unmarkFeedbackDuplicateAction,
  type DuplicateState,
  type StatusState,
} from "./actions";

const ROLE_LABELS: Record<string, string> = {
  business: "Business",
  influencer: "Creator",
};

/** One request in the admin queue, with what an admin can do to it. */
export function FeedbackCard({ request }: { request: AdminFeedbackRequest }) {
  const merged = request.duplicateOfNumber !== null;
  return (
    <li className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold break-words text-ink">
            <span className="text-muted tabular-nums">#{request.number}</span>{" "}
            {request.title}
          </p>
          <p className="mt-1 text-sm text-muted">
            {kindLabel(request.kind)} · {formatDate(request.createdAt)} ·{" "}
            {request.senderName ?? "No profile yet"} (
            {ROLE_LABELS[request.senderRole] ?? request.senderRole}) ·{" "}
            <a
              href={`mailto:${request.senderEmail}`}
              className="link break-all"
            >
              {request.senderEmail}
            </a>
          </p>
        </div>
        <FeedbackStatusPill status={request.status} />
      </div>
      <p className="mt-3 whitespace-pre-line break-words text-ink">
        {request.details}
      </p>
      {request.duplicateCount > 0 && (
        <p className="mt-2 text-sm text-muted">
          {request.duplicateCount === 1
            ? "1 other request is merged into this one."
            : `${request.duplicateCount} other requests are merged into this one.`}{" "}
          {request.status === "shipped"
            ? "Their senders have been told it’s live."
            : "Their senders are told when this ships."}
        </p>
      )}

      {merged ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <p className="text-sm text-muted">
            Merged into #{request.duplicateOfNumber}. Its status and note show
            to this sender.
          </p>
          <form action={unmarkFeedbackDuplicateAction}>
            <input type="hidden" name="id" value={request.id} />
            <Button type="submit" variant="secondary" size="sm">
              Not a duplicate
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 border-t border-hairline pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <StatusForm request={request} />
          {request.duplicateCount === 0 && <DuplicateForm id={request.id} />}
        </div>
      )}
    </li>
  );
}

function StatusForm({ request }: { request: AdminFeedbackRequest }) {
  const [state, formAction, pending] = useActionState<StatusState, FormData>(
    setFeedbackStatusAction,
    { status: "idle" },
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={request.id} />
      <SelectField
        id={`status-${request.id}`}
        label="Status"
        name="status"
        placeholder="Choose a status"
        options={FEEDBACK_STATUSES.map((status) => ({ ...status }))}
        defaultValue={state.values?.status ?? request.status}
        error={state.errors?.status}
        required
      />
      <TextAreaField
        id={`note-${request.id}`}
        label="Note to the sender"
        name="note"
        optional
        rows={2}
        maxLength={FEEDBACK_LIMITS.noteMax}
        hint="Shown on their Feedback page, and in the email when it ships."
        defaultValue={state.values?.note ?? request.adminNote ?? ""}
        error={state.errors?.note}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function DuplicateForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<DuplicateState, FormData>(
    markFeedbackDuplicateAction,
    { status: "idle" },
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <TextField
        id={`main-${id}`}
        label="Duplicate of"
        name="main"
        inputMode="numeric"
        placeholder="#42"
        hint="The number of the main request."
        defaultValue={state.values?.main}
        error={state.errors?.main}
        required
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Merging…" : "Merge"}
      </Button>
    </form>
  );
}
