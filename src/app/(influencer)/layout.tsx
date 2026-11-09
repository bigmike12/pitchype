import type { Metadata } from "next";
import type { ReactNode } from "react";

// Creator-only pages: signed in, never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InfluencerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
