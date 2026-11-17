import { Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SidebarNav, TopBarContent } from "@/components/shells/portal-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { getSignedInUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getWalletBalance } from "@/lib/db/money";
import { listMyNotifications } from "@/lib/db/notifications";
import { formatNaira } from "@/lib/money";
import { describeNotification } from "@/lib/notifications";
import { mainActionFor, navFor, type PortalViewer } from "@/lib/portal";

import { signOutAction } from "./actions";
import { NotificationBell, type BellItem } from "./notification-bell";
import { getPortalViewer } from "./viewer";

// The role-dependent parts of the portal shell. The layout streams each in
// its own Suspense boundary; both share one cached viewer lookup.

const itemsFor = (viewer: PortalViewer) =>
  navFor(viewer.role).map((item) => {
    if (item.icon === "inbox") return { ...item, badge: viewer.unread };
    if (item.icon === "disputes") {
      return { ...item, badge: viewer.openDisputes };
    }
    return item;
  });

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
      wallet={
        viewer.role === "influencer" ? (
          <Suspense
            fallback={<Skeleton className="h-11 w-24 rounded-control lg:h-9" />}
          >
            <WalletChip />
          </Suspense>
        ) : null
      }
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

/**
 * A creator's balance in the top bar, so they can see what they have without
 * opening the wallet. It is the same figure as the wallet page (balance after
 * our fee). The top bar re-renders when a notification arrives and after a
 * payout request, so it keeps up with settlements and payouts.
 */
async function WalletChip() {
  const user = await getSignedInUser();
  if (!user || user.role !== "influencer") return null;
  const balance = formatNaira(
    await getWalletBalance(user.id, "creator_wallet"),
  );
  return (
    <Link
      href="/wallet"
      aria-label={`Wallet: ${balance} available`}
      title="Your wallet"
      className="inline-flex min-h-11 max-w-[8rem] items-center gap-1.5 rounded-control border border-hairline-strong px-2.5 text-sm font-semibold text-ink tabular-nums hover:bg-surface-soft sm:max-w-none sm:gap-2 sm:px-3 lg:min-h-9"
    >
      <Wallet
        className="size-[1.125rem] shrink-0 text-muted"
        aria-hidden="true"
      />
      <span className="truncate">{balance}</span>
    </Link>
  );
}
