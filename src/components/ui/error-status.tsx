"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/ui/status-page";
import { CONTACT_EMAIL } from "@/lib/site";

/**
 * What every error.tsx shows when a page fails to render: say it's on our
 * side, offer a retry and a way out, and show the error's reference so
 * support can find it in the log. The error itself is never shown (it can
 * hold anything). Says nothing about money or what was saved: the page
 * can't know.
 */
export function ErrorStatus({
  error,
  reset,
  title = "Something went wrong",
  inPortal = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  inPortal?: boolean;
}) {
  return (
    <>
      {/* A failure can still answer 200 (the page had started streaming), so say it here. */}
      <meta name="robots" content="noindex" />
      <StatusPage
        code="500"
        title={title}
        reference={error.digest}
        inPortal={inPortal}
        actions={
          <>
            <Button type="button" size="lg" onClick={reset}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
            <Link
              href={inPortal ? "/home" : "/"}
              className={buttonVariants({ size: "lg", variant: "secondary" })}
            >
              {inPortal ? "Back to your home" : "Go to the home page"}
            </Link>
          </>
        }
      >
        This is on our side, not yours. Try again in a moment. If it keeps
        happening, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="link">
          {CONTACT_EMAIL}
        </a>{" "}
        and tell us the reference below.
      </StatusPage>
    </>
  );
}
