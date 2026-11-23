import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/ui/status-page";

// A signed-in person's page that doesn't exist (or isn't theirs to see):
// inside the portal shell, with a way back to their home.
export default function PortalNotFound() {
  return (
    <StatusPage
      code="404"
      title="We couldn’t find that page"
      inPortal
      actions={
        <Link href="/home" className={buttonVariants({ size: "lg" })}>
          Back to your home
        </Link>
      }
    >
      It may have been removed, or the link may be wrong.
    </StatusPage>
  );
}
