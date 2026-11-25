"use server";

import { redirect } from "next/navigation";

import { verifyEmailLink } from "@/lib/auth";

// Spends the emailed link, once (see page.tsx for why this isn't done on
// opening the page). Where to go next depends only on the type, never on a
// submitted address, so the form can't be turned into a redirect to another
// site.
export async function confirmEmailLinkAction(form: FormData): Promise<void> {
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  if (
    typeof tokenHash !== "string" ||
    tokenHash === "" ||
    (type !== "email" && type !== "recovery")
  ) {
    redirect("/link-expired");
  }

  const verified = await verifyEmailLink(tokenHash, type);
  if (!verified) redirect("/link-expired");
  redirect(type === "recovery" ? "/reset-password" : "/onboarding");
}
