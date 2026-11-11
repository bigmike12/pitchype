import { redirect } from "next/navigation";

import { SidebarNav, TopBarContent } from "@/components/shells/portal-nav";
import { getSignedInUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { listMyNotifications } from "@/lib/db/notifications";
import { describeNotification } from "@/lib/notifications";
import { mainActionFor, navFor, type PortalViewer } from "@/lib/portal";

import { signOutAction } from "./actions";
import { NotificationBell, type BellItem } from "./notification-bell";
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
      bell={
        viewer.role === "admin" ? null : <Notifications role={viewer.role} />
      }
    />
  );
}

/** The bell's data: the latest notifications, already put into words. */
async function Notifications({ role }: { role: "business" | "influencer" }) {
  const user = await getSignedInUser();
  if (!user) return null;
  const { items, unread } = await listMyNotifications(20);
  const bellItems: BellItem[] = items.flatMap((n) => {
    const view = describeNotification(n, role);
    return view
      ? [
          {
            id: n.id,
            title: view.title,
            body: view.body,
            at: formatDateTime(n.occurredAt),
            unread: n.readAt === null,
          },
        ]
      : [];
  });
  return (
    <NotificationBell userId={user.id} items={bellItems} unread={unread} />
  );
}
