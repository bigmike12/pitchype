import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** A slug that isn't listed: never published, moved back to drafts, or hidden. */
export default function CreatorNotFound() {
  return (
    <main id="main" className="container-page py-20 sm:py-28">
      <div className="max-w-xl">
        <h1 className="text-display-lg">This profile isn’t public</h1>
        <p className="mt-4 text-lg">
          The creator may have taken their page down, or the link may be
          mistyped. Their work can still be on Pitchype under another address.
        </p>
        <Link
          href="/creators"
          className={buttonVariants({ size: "lg", className: "mt-8" })}
        >
          Browse creators
        </Link>
      </div>
    </main>
  );
}
