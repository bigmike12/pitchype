"use client";

import { RotateCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { StatusPage } from "@/components/ui/status-page";
import { CONTACT_EMAIL } from "@/lib/site";

import { bricolage, inter } from "./fonts";
import "./globals.css";

// The last resort: the root layout itself failed, so this replaces it and has
// to bring its own html and body.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body>
        <title>Something went wrong | Pitchype</title>
        <meta name="robots" content="noindex" />
        <StatusPage
          code="500"
          title="Something went wrong"
          reference={error.digest}
          actions={
            <>
              <Button type="button" size="lg" onClick={reset}>
                <RotateCw aria-hidden="true" />
                Try again
              </Button>
              {/* A full page load on purpose: the router may be what broke. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className={buttonVariants({ size: "lg", variant: "secondary" })}
              >
                Go to the home page
              </a>
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
      </body>
    </html>
  );
}
