import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "That link has expired" };

// Where emailed links land when they can't be used: expired, already used,
// or opened after the account was set up some other way.
export default function LinkExpiredPage() {
  return (
    <>
      <h1 className="text-display-lg">That link has expired</h1>
      <p className="mt-3 text-lg">
        Links in our emails work once and last an hour. Log in and we’ll send a
        fresh confirmation link if you still need one, or reset your password.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Log in
        </Link>
        <Link
          href="/forgot-password"
          className={buttonVariants({ size: "lg", variant: "secondary" })}
        >
          Reset your password
        </Link>
      </div>
    </>
  );
}
