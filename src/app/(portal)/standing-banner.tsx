import { PauseCircle } from "lucide-react";
import Link from "next/link";

import { Callout } from "@/components/ui/callout";
import { getSignedInUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/creator-profile";
import { getMyStanding } from "@/lib/db/moderation";
import { standingView } from "@/lib/moderation";

/**
 * On every portal page while new activity is paused or the account is
 * suspended: what that means and where to appeal. Reading and existing work
 * carry on (spec §4).
 */
export async function StandingBanner() {
  const user = await getSignedInUser();
  if (!user || user.role === "admin") return null;
  const view = standingView(await getMyStanding(user.id), new Date());
  if (view.state !== "paused" && view.state !== "suspended") return null;

  return (
    <Callout
      tone="danger"
      icon={PauseCircle}
      title={
        view.state === "paused"
          ? "New activity is paused on your account"
          : "Your account is suspended"
      }
      action={
        <Link href="/account/standing" className="link">
          See why and appeal
        </Link>
      }
      className="mb-6"
    >
      {view.state === "paused" && view.until
        ? `Until ${formatDateTime(view.until)} you can’t send messages, apply or hire. Your existing work, campaigns and payments carry on.`
        : "While we review it, you can’t send messages, apply or hire. Your existing work, campaigns and payments carry on."}
    </Callout>
  );
}
