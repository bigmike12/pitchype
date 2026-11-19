import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/(portal)/actions";
import { OnboardingShell } from "@/components/shells/onboarding-shell";
import { requireUser } from "@/lib/auth";

// Signed-in setup pages: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <OnboardingShell signOutAction={signOutAction} user={user}>
      {children}
    </OnboardingShell>
  );
}
