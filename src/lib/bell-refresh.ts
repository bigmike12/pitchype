/**
 * When the bell should refresh the page after a Realtime change to one of
 * the person's notifications rows.
 *
 * The email queue also updates unread rows (when it claims one to send and
 * when it finishes), and Realtime sends those too. Only a real change should
 * refresh: a new row, or a grouped row (a chat thread) bumped by a new event,
 * which is the one thing that moves `occurred_at`. A row being marked read
 * comes from this person's own action, which refreshes the page itself.
 *
 * `seen` remembers each row's `occurred_at` (as milliseconds, so the two
 * timestamp spellings Postgres and Realtime use compare equal). The bell
 * fills it from the rows it shows; this function keeps it current.
 */
export type NotificationChange = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  row: { id?: string; read_at?: string | null; occurred_at?: string };
};

export function shouldRefreshBell(
  seen: Map<string, number>,
  change: NotificationChange,
): boolean {
  const { eventType, row } = change;
  if (eventType === "DELETE" || !row.id) return false;

  const occurredAt = row.occurred_at ? Date.parse(row.occurred_at) : NaN;
  const previous = seen.get(row.id);
  if (!Number.isNaN(occurredAt)) seen.set(row.id, occurredAt);

  if (eventType === "INSERT") return true;
  // A row not seen before (older than the bell's list) refreshes once.
  return row.read_at === null && previous !== occurredAt;
}
