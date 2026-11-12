"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import { cancelEngagement } from "@/lib/db/applications";
import { text } from "@/lib/form-data";

// Ends a hire before payment. The database checks it's this business's and
// still waiting for payment; nothing was charged, so nothing is refunded.
export async function cancelHireAction(form: FormData): Promise<void> {
  await requireRole("business");
  await cancelEngagement(text(form, "engagementId"));
  refresh();
}
