import type { Metadata } from "next";
import type { ReactNode } from "react";

// Signed-in setup pages: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
