import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/ui/status-page";

// Next adds noindex to every not-found page.
export const metadata: Metadata = { title: "Page not found" };

// Any address that matches no page. It sits outside the route groups, so it
// brings the marketing header and footer itself.
export default function NotFound() {
  return (
    <div className="contents triangle-cursor">
      <SiteHeader />
      <StatusPage
        code="404"
        title="That page isn’t here"
        actions={
          <>
            <Link href="/" className={buttonVariants({ size: "lg" })}>
              Go to the home page
            </Link>
            <Link
              href="/creators"
              className={buttonVariants({ size: "lg", variant: "secondary" })}
            >
              Find creators
            </Link>
          </>
        }
      >
        The link may be old or mistyped. You can start again from the home page,
        or look through the creators on Pitchype.
      </StatusPage>
      <SiteFooter />
    </div>
  );
}
