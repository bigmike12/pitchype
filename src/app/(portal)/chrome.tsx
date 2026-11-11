import { redirect } from "next/navigation";

import { SidebarNav, TopBarContent } from "@/components/shells/portal-nav";
import { mainActionFor, navFor, type PortalViewer } from "@/lib/portal";

import { signOutAction } from "./actions";
import { getPortalViewer } from "./viewer";

// The role-dependent parts of the portal shell. The layout streams each in
// its own Suspense boundary; both share one cached viewer lookup.

const itemsFor = (viewer: PortalViewer) =>
  navFor(viewer.role).map((item) =>
    item.icon === "inbox" ? { ...item, badge: viewer.unread } : item,
  );

export async function PortalSidebar() {
  const viewer = await getPortalViewer();
  if (!viewer) return null;
  return (
    <SidebarNav
      viewer={viewer}
      items={itemsFor(viewer)}
      signOutAction={signOutAction}
    />
  );
}

export async function PortalTopBar() {
  const viewer = await getPortalViewer();
  if (!viewer) return null;
  // One place for every portal page: no profile yet means onboarding first.
  if (viewer.needsOnboarding) redirect("/onboarding");
  return (
    <TopBarContent
      viewer={viewer}
      items={itemsFor(viewer)}
      mainAction={mainActionFor(viewer.role)}
      signOutAction={signOutAction}
    />
  );
}
