import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import {
  PortalShell,
  SidebarSkeleton,
  TopBarSkeleton,
} from "@/components/shells/portal-shell";

import { PortalSidebar, PortalTopBar } from "./chrome";
import { StandingBanner } from "./standing-banner";

// Signed-in pages for every role: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalShell
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <PortalSidebar />
        </Suspense>
      }
      topBar={
        <Suspense fallback={<TopBarSkeleton />}>
          <PortalTopBar />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <StandingBanner />
      </Suspense>
      {children}
    </PortalShell>
  );
}
