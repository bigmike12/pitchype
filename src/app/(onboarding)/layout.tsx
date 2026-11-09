import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/(portal)/actions";
import { OnboardingShell } from "@/components/shells/onboarding-shell";

// Signed-in setup pages: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OnboardingShell signOutAction={signOutAction}>{children}</OnboardingShell>
  );
}
