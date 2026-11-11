"use server";

import { refresh } from "next/cache";

import { requireUser } from "@/lib/auth";
import { blockUser, unblockUser } from "@/lib/db/moderation";
import { text } from "@/lib/form-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Blocking stops new contact and new work between two people and changes
// nothing else (create_moderation migration). The blocked person isn't told.

export async function blockAction(form: FormData): Promise<void> {
  await requireUser();
  const other = text(form, "otherId");
  if (UUID.test(other)) await blockUser(other);
  refresh();
}

export async function unblockAction(form: FormData): Promise<void> {
  await requireUser();
  const other = text(form, "otherId");
  if (UUID.test(other)) await unblockUser(other);
  refresh();
}
