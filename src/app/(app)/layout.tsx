import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Each signed-in page picks its shell: onboarding continues the sign-up
// flow in the auth layout, the account page uses the app layout.
export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
