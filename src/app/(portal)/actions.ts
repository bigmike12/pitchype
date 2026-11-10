"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";

// Used by the portal shell and the onboarding shell.
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
