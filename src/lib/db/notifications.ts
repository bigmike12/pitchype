// Data access for notifications.
//
// Rows are written only by database triggers (create_notifications
// migration); people read their own through row level security and mark them
// read through mark_notifications_read().

import type { NotificationRow } from "@/lib/notifications";
import { createSessionClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

import { isObject } from "./json";

const toRow = (r: {
  id: string;
  kind: string;
  data: Json;
  occurred_at: string;
  read_at: string | null;
}): NotificationRow => ({
  id: r.id,
  kind: r.kind,
  data: isObject(r.data) ? r.data : {},
  occurredAt: r.occurred_at,
  readAt: r.read_at,
});

/** The signed-in person's latest notifications and how many are unread. */
export async function listMyNotifications(
  limit = 20,
): Promise<{ items: NotificationRow[]; unread: number }> {
  const supabase = await createSessionClient();
  const [list, count] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, data, occurred_at, read_at")
      .order("occurred_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (list.error) throw new Error(`notifications failed (${list.error.code})`);
  if (count.error) throw new Error(`unread count failed (${count.error.code})`);
  return { items: list.data.map(toRow), unread: count.count ?? 0 };
}

/** One of the signed-in person's notifications, or null. */
export async function getMyNotification(
  id: string,
): Promise<NotificationRow | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, data, occurred_at, read_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`notification failed (${error.code})`);
  return data ? toRow(data) : null;
}

/** Marks the given notifications read, or all of them when ids is null. */
export async function markNotificationsRead(ids: string[] | null) {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("mark_notifications_read", {
    // The generated types don't model SQL nulls for function arguments.
    ids: ids as string[],
  });
  if (error) throw new Error(`mark read failed (${error.code})`);
}
