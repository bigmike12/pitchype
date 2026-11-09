import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { PortalShell } from "@/components/shells/portal-shell";

import { PortalSidebar, PortalTopBar } from "./chrome";

// Signed-in pages for every role: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      sidebar={
        <Suspense fallback={null}>
          <PortalSidebar />
        </Suspense>
      }
      topBar={
        <Suspense fallback={null}>
          <PortalTopBar />
        </Suspense>
      }
    >
      {children}
    </PortalShell>
  );
}
