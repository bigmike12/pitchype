"use client";

import { Check, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "idle" | "copied" | "failed";

/**
 * Shares a creator's public page: the phone's share sheet where there is one,
 * otherwise the link goes to the clipboard. The result is said in words next
 * to the button (and to screen readers), since a copy has nothing to see.
 * `url` is the canonical page address, with no tracking parameters.
 */
export function ShareProfileButton({
  url,
  name,
  label = "Share profile",
  variant = "secondary",
  className,
}: {
  url: string;
  name: string;
  label?: string;
  variant?: "default" | "secondary";
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");

  // The message goes after a few seconds, so the next share says it again.
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${name} on Pitchype`, url });
        return;
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      <Button type="button" variant={variant} onClick={share}>
        {status === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Share2 aria-hidden="true" />
        )}
        {status === "copied" ? "Link copied" : label}
      </Button>
      <p aria-live="polite" className="text-sm text-muted">
        {status === "failed" && (
          <>
            Copy this link:{" "}
            <span className="font-medium break-all text-ink select-all">
              {url}
            </span>
          </>
        )}
        {status === "copied" && (
          <span className="sr-only">Link copied to your clipboard.</span>
        )}
      </p>
    </div>
  );
}
