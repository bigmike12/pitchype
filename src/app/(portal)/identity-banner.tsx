import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Callout } from "@/components/ui/callout";
import { getSignedInUser } from "@/lib/auth";
import { isIdentityVerified } from "@/lib/db/identity";
import { identityBanner } from "@/lib/identity-gate";

/**
 * On every portal page for someone who hasn't confirmed their identity yet:
 * what they can't do until they do (applying, hiring, publishing, withdrawing),
 * with a link to the account page. Nothing already agreed is affected.
 */
export async function IdentityBanner() {
  const user = await getSignedInUser();
  if (!user || user.role === "admin") return null;
  const words = identityBanner(user.role, await isIdentityVerified(user.id));
  if (words === null) return null;

  return (
    <Callout
      tone="attention"
      icon={ShieldCheck}
      title={words}
      action={
        <Link href="/account#identity" className="link">
          Confirm your identity
        </Link>
      }
      className="mb-6"
    >
      It takes a couple of minutes. Your running jobs, campaigns, wallet and
      payouts carry on as they are.
    </Callout>
  );
}
