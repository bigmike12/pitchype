"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { signupHrefFor } from "@/lib/signup-link";

function GetStartedLink({ href }: { href: string }) {
  return (
    <Link href={href} className={buttonVariants({ className: "max-sm:px-3" })}>
      Get started
    </Link>
  );
}

function RoleAwareLink() {
  return <GetStartedLink href={signupHrefFor(usePathname())} />;
}

// The header's sign-up button. On an audience page it carries that page's
// role, so sign-up doesn't ask which side again. Elsewhere it's plain /signup.
// The pathname isn't known when a dynamic route (/creators/[slug]) is
// prerendered, so the plain link is the fallback until it streams in.
export function HeaderCta() {
  return (
    <Suspense fallback={<GetStartedLink href="/signup" />}>
      <RoleAwareLink />
    </Suspense>
  );
}
