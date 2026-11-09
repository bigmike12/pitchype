import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "@/components/shells/auth-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "That link has expired" };

// Where emailed links land when they can't be used: expired, already used,
// or opened after the account was set up some other way.
export default function LinkExpiredPage() {
  return (
    <>
      <AuthHeading title="That link has expired">
        Links in our emails work once and last an hour. Log in and we’ll send a
        fresh confirmation link if you still need one, or reset your password.
      </AuthHeading>
      <div className="flex flex-col gap-3">
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
