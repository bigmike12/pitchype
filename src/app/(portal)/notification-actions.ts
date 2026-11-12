"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  getMyNotification,
  markNotificationsRead,
} from "@/lib/db/notifications";
import { describeNotification } from "@/lib/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a notification: marks it read and goes where it points. The link is
 * worked out again from the stored row, never taken from the form.
 */
export async function openNotificationAction(formData: FormData) {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) redirect("/home");

  const notification = await getMyNotification(id);
  if (!notification) redirect("/home");
  if (!notification.readAt) await markNotificationsRead([notification.id]);

  const view = describeNotification(
    notification,
    user.role === "influencer" ? "influencer" : "business",
  );
  // The bell and the Inbox badge live in the layout, which a redirect alone
  // doesn't redraw.
  refresh();
  redirect(view?.href ?? "/home");
}

export async function markAllNotificationsReadAction() {
  await requireUser();
  await markNotificationsRead(null);
  refresh();
}
