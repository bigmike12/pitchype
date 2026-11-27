// Data access for feedback requests. Everything goes through the database
// functions in 20261202100100_create_feedback_requests.sql: people send and
// read their own; admins read all, set statuses and merge duplicates (both
// checked inside the functions).

import type { FeedbackKind, FeedbackStatus } from "@/lib/feedback";
import { createSessionClient } from "@/lib/supabase/server";

import { refused, type Result } from "./refusal";

export type MyFeedbackRequest = {
  id: string;
  number: number;
  kind: string;
  title: string;
  details: string;
  /** For a merged request, the main request's. */
  status: string;
  adminNote: string | null;
  createdAt: string;
  /** Merged into someone else's request about the same thing. */
  merged: boolean;
};

export async function submitFeedback(input: {
  kind: FeedbackKind;
  title: string;
  details: string;
}): Promise<Result<{ id: string; number: number }>> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("submit_feedback", input);
  if (error) return refused(error, "submit feedback");
  const row = data?.[0];
  if (!row) throw new Error("submit feedback returned no row");
  return { ok: true, value: { id: row.id, number: row.number } };
}

export async function listMyFeedback(): Promise<MyFeedbackRequest[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("my_feedback_requests");
  if (error) throw new Error(`my feedback failed (${error.code})`);
  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.number,
    kind: row.kind,
    title: row.title,
    details: row.details,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    merged: row.merged,
  }));
}

// Admins -------------------------------------------------------------------------------

export type AdminFeedbackRequest = {
  id: string;
  number: number;
  kind: string;
  title: string;
  details: string;
  /** What the sender sees: the main request's status for a merged one. */
  status: string;
  adminNote: string | null;
  createdAt: string;
  shippedAt: string | null;
  duplicateOfNumber: number | null;
  duplicateCount: number;
  senderRole: string;
  senderEmail: string;
  senderName: string | null;
};

export async function listFeedbackForAdmin(): Promise<AdminFeedbackRequest[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc("admin_feedback_requests");
  if (error) throw new Error(`admin feedback failed (${error.code})`);
  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.number,
    kind: row.kind,
    title: row.title,
    details: row.details,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    shippedAt: row.shipped_at,
    duplicateOfNumber: row.duplicate_of_number,
    duplicateCount: row.duplicate_count,
    senderRole: row.sender_role,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
  }));
}

export async function setFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  note: string | null,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("set_feedback_status", {
    request_id: id,
    new_status: status,
    // The function stores a blank note as no note.
    note: note ?? "",
  });
  if (error) return refused(error, "set feedback status");
  return { ok: true, value: null };
}

export async function markFeedbackDuplicate(
  id: string,
  mainNumber: number,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("mark_feedback_duplicate", {
    request_id: id,
    main_number: mainNumber,
  });
  if (error) return refused(error, "mark feedback duplicate");
  return { ok: true, value: null };
}

export async function unmarkFeedbackDuplicate(
  id: string,
): Promise<Result<null>> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("unmark_feedback_duplicate", {
    request_id: id,
  });
  if (error) return refused(error, "unmark feedback duplicate");
  return { ok: true, value: null };
}
