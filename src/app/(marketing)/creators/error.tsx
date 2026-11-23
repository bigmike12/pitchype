"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** When the directory or a profile can't load: say so plainly and offer a retry. */
export default function CreatorsError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main id="main" className="container-page py-20 sm:py-28">
      <div className="max-w-xl">
        <h1 className="text-display-lg">We couldn’t load creators just now</h1>
        <p className="mt-4 text-lg">
          This is on our side, not yours. Try again in a moment.
        </p>
        <Button type="button" size="lg" className="mt-8" onClick={reset}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    </main>
  );
}
